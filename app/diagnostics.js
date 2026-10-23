'use strict';

// Playback gesture/priority shared variables and media diagnostic traces.
// One of the ordered classic scripts listed in scripts/app-scripts.cjs; all share one global scope.

let drivePreviewTimeoutTimer = null;
let swipePreviewDirection = null;
let swipePreviewTargetId = null;
let swipeGestureDirection = null;
let swipeGestureTargetId = null;
let swipeGestureAwaitingPopulation = false;
let swipeNeighborGeneration = 0;
let swipeStageWidth = 0;
let swipeStageHeight = 0;
let playbackPopulationWarmPromise = null;
let writableOpfsSupportPromise = null;
let edgeBackGesture = null;
const warmedThumbnails = new Map();
let playerMediaPriorityActive = false;
let mediaDiagnosticTrace = null;
let mediaDiagnosticSequence = 0;
let mediaDiagnosticPlaybackSequence = 0;
const mediaDiagnosticRetiredTraces = new Map();
const mediaDiagnosticDirectRequestOwners = new Map();
const MEDIA_DIAGNOSTIC_RETIRED_TRACE_LIMIT = 8;
const MEDIA_DIAGNOSTIC_PROGRESS_INTERVAL_MS = 250;
const MEDIA_DIAGNOSTIC_WORKER_STAGES = new Set([
  'credential-requested', 'credential-ready', 'credential-missing',
  'request-start', 'headers', 'first-byte', 'body-progress', 'body-complete',
  'first-byte-timeout', 'body-no-progress', 'body-error', 'http-error', 'range-error', 'request-cancelled'
]);

function getMediaDiagnosticSink() {
  return typeof globalThis.__driveOriginalMediaTraceSink === 'function'
    ? globalThis.__driveOriginalMediaTraceSink
    : null;
}

function reportAppFailure(stage, error, level = 'error') {
  // Provider messages, stacks and attached objects can contain private IDs/URLs.
  const status = Number(error?.status);
  const detail = {
    category: error?.name === 'AbortError' ? 'cancelled'
      : error?.name === 'TypeError' ? 'network-or-type'
      : status === 401 ? 'authentication'
      : status === 403 ? 'permission'
      : status === 404 ? 'missing'
      : status === 429 ? 'rate-limit'
      : status >= 500 && status <= 599 ? 'server' : 'failure'
  };
  if (Number.isInteger(status) && status >= 100 && status <= 599) detail.status = status;
  const codes = ['candidate_read_only', 'insufficient_scope', 'account_mismatch',
    'reconnect_required', 'reauthorization_required', 'auth_unavailable', 'stale_revision'];
  if (codes.includes(error?.code)) detail.code = error.code;
  console[level === 'warn' ? 'warn' : 'error'](`[drive-original] ${stage}`, detail);
}

function mediaDiagnosticTimestamp() {
  return Date.now();
}

function sanitizeMediaDiagnosticDetails(details = {}) {
  const allowed = [
    'route', 'reason', 'kind', 'declaredMime', 'declaredSize', 'attempt',
    'requestId', 'status', 'requestedRange', 'rangeSatisfied', 'playbackMode',
    'bytes', 'totalBytes', 'mediaErrorCode', 'seekGeneration', 'currentTime',
    'targetTime', 'presentedMediaTime', 'tolerance', 'activeElapsedMs',
    'confidence', 'fromSession', 'toSession', 'terminal', 'stale'
  ];
  const sanitized = {};
  for (const key of allowed) {
    const value = details[key];
    if (value == null) continue;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

function emitMediaDiagnosticTraceStage(trace, stage, details = {}, session = state.mediaSession, {
  allowKnownSession = false,
  stale = false
} = {}) {
  const sink = getMediaDiagnosticSink();
  const numericSession = Number(session);
  const currentSession = Number(trace?.mediaSession);
  const knownSession = trace?.sessions?.has(numericSession);
  if (!trace || !sink || !Number.isFinite(numericSession)) return false;
  if (numericSession !== currentSession && !(allowKnownSession && knownSession)) return false;
  const at = mediaDiagnosticTimestamp();
  const event = {
    type: 'DRIVE_ORIGINAL_MEDIA_STAGE',
    version: 1,
    source: 'app',
    playbackId: trace.playbackId,
    traceId: trace.traceId,
    fileKey: trace.fileKey,
    mediaSession: String(numericSession),
    sequence: ++mediaDiagnosticSequence,
    at,
    elapsedMs: Math.max(0, at - trace.startedAt),
    stage: String(stage || 'unknown'),
    ...sanitizeMediaDiagnosticDetails(stale ? { ...details, stale: true } : details)
  };
  try { sink(event); } catch (_) { /* Diagnostics never change playback. */ }
  return true;
}

function emitMediaDiagnosticStage(stage, details = {}, session = state.mediaSession) {
  return emitMediaDiagnosticTraceStage(mediaDiagnosticTrace, stage, details, session);
}

function beginMediaDiagnosticTrace(file, session, startedAt = mediaDiagnosticTimestamp()) {
  if (!getMediaDiagnosticSink()) {
    mediaDiagnosticTrace = null;
    mediaDiagnosticRetiredTraces.clear();
    mediaDiagnosticDirectRequestOwners.clear();
    return null;
  }
  const ordinal = ++mediaDiagnosticPlaybackSequence;
  const playbackId = `playback-${startedAt.toString(36)}-${ordinal.toString(36)}`;
  mediaDiagnosticTrace = {
    playbackId,
    traceId: playbackId,
    fileKey: `file-${ordinal}`,
    mediaSession: Number(session),
    sessions: new Set([Number(session)]),
    startedAt,
    firstFrameSeen: false,
    playbackProgressSeen: false,
    seekGeneration: 0,
    directRequestSequence: 0,
    directRequests: new Map()
  };
  emitMediaDiagnosticStage('intent', {
    kind: file?.mimeType?.startsWith('video/') ? 'video' : 'image',
    declaredMime: String(file?.mimeType || ''),
    declaredSize: Number(file?.size) || 0
  }, session);
  return mediaDiagnosticTrace;
}

function updateMediaDiagnosticSession(session, reason) {
  const trace = mediaDiagnosticTrace;
  if (!trace) return;
  const previous = trace.mediaSession;
  trace.mediaSession = Number(session);
  trace.sessions.add(Number(session));
  emitMediaDiagnosticStage('session-changed', {
    reason,
    fromSession: Number(previous),
    toSession: Number(session)
  }, session);
}

function finishMediaDiagnosticTrace(reason = 'closed') {
  if (!mediaDiagnosticTrace) return;
  const trace = mediaDiagnosticTrace;
  emitMediaDiagnosticStage('trace-finished', { reason, terminal: true }, trace.mediaSession);
  mediaDiagnosticRetiredTraces.delete(trace.traceId);
  mediaDiagnosticRetiredTraces.set(trace.traceId, trace);
  while (mediaDiagnosticRetiredTraces.size > MEDIA_DIAGNOSTIC_RETIRED_TRACE_LIMIT) {
    const retiredTraceId = mediaDiagnosticRetiredTraces.keys().next().value;
    const retiredTrace = mediaDiagnosticRetiredTraces.get(retiredTraceId);
    for (const requestId of retiredTrace?.directRequests?.keys?.() || []) {
      mediaDiagnosticDirectRequestOwners.delete(requestId);
    }
    mediaDiagnosticRetiredTraces.delete(retiredTraceId);
  }
  mediaDiagnosticTrace = null;
}

function getMediaDiagnosticTraceId(session = state.mediaSession) {
  return mediaDiagnosticTrace && Number(mediaDiagnosticTrace.mediaSession) === Number(session)
    ? mediaDiagnosticTrace.traceId
    : '';
}

function beginDirectMediaDiagnosticRequest(session, attempt) {
  const trace = mediaDiagnosticTrace;
  if (!trace || Number(trace.mediaSession) !== Number(session)) return '';
  const requestId = `${trace.traceId}-direct-${++trace.directRequestSequence}`;
  trace.directRequests.set(requestId, {
    firstByte: false,
    lastProgressBytes: 0,
    lastProgressAt: mediaDiagnosticTimestamp()
  });
  mediaDiagnosticDirectRequestOwners.set(requestId, trace);
  emitMediaDiagnosticStage('request-start', {
    route: 'full-original', requestId, attempt
  }, session);
  return requestId;
}

function recordDirectMediaDiagnosticBytes(session, requestId, bytes, totalBytes) {
  const trace = mediaDiagnosticDirectRequestOwners.get(requestId);
  const request = trace?.directRequests?.get(requestId);
  const numericSession = Number(session);
  if (!request || !trace.sessions.has(numericSession)) return;
  const stale = trace !== mediaDiagnosticTrace || Number(trace.mediaSession) !== numericSession;
  if (!request.firstByte && bytes > 0) {
    request.firstByte = true;
    request.lastProgressAt = mediaDiagnosticTimestamp();
    emitMediaDiagnosticTraceStage(trace, 'first-byte', {
      route: 'full-original', requestId, bytes, totalBytes
    }, session, { allowKnownSession: true, stale });
  }
  const now = mediaDiagnosticTimestamp();
  if (
    bytes - request.lastProgressBytes >= 1024 * 1024
    || now - request.lastProgressAt >= MEDIA_DIAGNOSTIC_PROGRESS_INTERVAL_MS
    || (totalBytes > 0 && bytes >= totalBytes)
  ) {
    request.lastProgressBytes = bytes;
    request.lastProgressAt = now;
    emitMediaDiagnosticTraceStage(trace, 'body-progress', {
      route: 'full-original', requestId, bytes, totalBytes
    }, session, { allowKnownSession: true, stale });
  }
}

function emitDirectMediaDiagnosticStage(session, requestId, stage, details = {}, {
  terminal = false,
  finalize = terminal
} = {}) {
  if (!requestId) return false;
  const trace = mediaDiagnosticDirectRequestOwners.get(requestId);
  const numericSession = Number(session);
  if (!trace || !trace.sessions.has(numericSession)) return false;
  const stale = trace !== mediaDiagnosticTrace || Number(trace.mediaSession) !== numericSession;
  const emitted = emitMediaDiagnosticTraceStage(trace, stage, {
    route: 'full-original', requestId, ...details, terminal
  }, session, { allowKnownSession: true, stale });
  if (finalize) {
    trace.directRequests.delete(requestId);
    mediaDiagnosticDirectRequestOwners.delete(requestId);
  }
  return emitted;
}

function completeDirectMediaDiagnosticRequest(session, requestId, bytes, totalBytes) {
  if (!requestId) return;
  recordDirectMediaDiagnosticBytes(session, requestId, bytes, totalBytes);
  emitDirectMediaDiagnosticStage(session, requestId, 'body-complete', {
    bytes, totalBytes
  }, { finalize: true });
}

function forwardWorkerMediaDiagnostic(data) {
  const trace = data?.traceId === mediaDiagnosticTrace?.traceId
    ? mediaDiagnosticTrace
    : mediaDiagnosticRetiredTraces.get(data?.traceId);
  if (!trace || !MEDIA_DIAGNOSTIC_WORKER_STAGES.has(data?.stage)) return;
  const messageSession = Number(data.sessionId ?? data.mediaSession);
  if (!Number.isFinite(messageSession) || !trace.sessions.has(messageSession)) return;
  const stale = trace !== mediaDiagnosticTrace || messageSession !== Number(trace.mediaSession);
  emitMediaDiagnosticTraceStage(trace, data.stage, {
    route: 'range',
    requestId: String(data.requestId || ''),
    status: Number(data.status) || 0,
    requestedRange: String(data.requestedRange || ''),
    rangeSatisfied: data.rangeSatisfied === true,
    playbackMode: String(data.playbackMode || ''),
    bytes: Number(data.bytes) || 0,
    totalBytes: Number(data.totalBytes) || 0,
    reason: String(data.reason || ''),
    terminal: data.terminal === true
  }, messageSession, { allowKnownSession: true, stale });
}

function recordMediaDiagnosticSeekStart(
  video,
  seekGeneration = null,
  targetTime = Number(video?.currentTime) || 0
) {
  if (!isCurrentMediaEvent(video) || !mediaDiagnosticTrace) return;
  const generation = Number.isSafeInteger(seekGeneration) && seekGeneration > 0
    ? seekGeneration
    : mediaDiagnosticTrace.seekGeneration + 1;
  mediaDiagnosticTrace.seekGeneration = generation;
  emitMediaDiagnosticStage('seeking', {
    seekGeneration: generation,
    currentTime: Number(targetTime) || 0
  });
}

function recordMediaDiagnosticSeekEnd(video, seekGeneration = null, { ownedFrame = false } = {}) {
  const trace = mediaDiagnosticTrace;
  if (!trace || !isCurrentMediaEvent(video)) return;
  const session = state.mediaSession;
  const generation = Number.isSafeInteger(seekGeneration) && seekGeneration > 0
    ? seekGeneration
    : trace.seekGeneration;
  const sourceGeneration = mediaSourceGeneration;
  const targetTime = Number(video.currentTime) || 0;
  emitMediaDiagnosticStage('seeked', {
    seekGeneration: generation,
    currentTime: targetTime
  }, session);
  if (ownedFrame) return;
  if (typeof video.requestVideoFrameCallback === 'function') {
    video.requestVideoFrameCallback((_now, metadata) => {
      const mediaTime = Number(metadata?.mediaTime);
      if (
        !isCurrentMediaEvent(video) || state.mediaSession !== session
        || mediaSourceGeneration !== sourceGeneration
        || trace !== mediaDiagnosticTrace || trace.seekGeneration !== generation
        || !mediaSeekTimesMatch(mediaTime, targetTime)
      ) return;
      emitMediaDiagnosticStage('seek-frame', {
        seekGeneration: generation,
        currentTime: Number(video.currentTime) || 0,
        presentedMediaTime: mediaTime,
        confidence: 'decoded-frame'
      }, session);
    });
  } else {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (
        !isCurrentMediaEvent(video) || state.mediaSession !== session
        || mediaSourceGeneration !== sourceGeneration
        || trace !== mediaDiagnosticTrace || trace.seekGeneration !== generation
      ) return;
      emitMediaDiagnosticStage('seek-presentation-fallback', {
        seekGeneration: generation,
        currentTime: Number(video.currentTime) || 0,
        confidence: 'paint-only'
      }, session);
    }));
  }
}

