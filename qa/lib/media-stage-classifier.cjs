'use strict';

const assert = require('node:assert/strict');

const TRACE_STAGES = new Set([
  'credential-requested', 'credential-ready', 'credential-missing',
  'request-start', 'headers', 'first-byte', 'body-progress', 'body-complete',
  'body-error', 'http-error', 'range-error', 'request-cancelled'
]);

const TRACE_FIELDS = new Set([
  'type', 'traceId', 'requestId', 'sessionId', 'mediaSession', 'sequence',
  'at', 'stage', 'status', 'bytes', 'requestedRange', 'rangeSatisfied',
  // Safe diagnostic primitives added by the opt-in worker hook. They do not
  // identify a Drive resource, credential, cookie, or response body.
  'attempt', 'totalBytes', 'playbackMode', 'reason', 'terminal'
]);

function eventFor(events, stage, sessionId) {
  return events.find((event) => event.stage === stage
    && (sessionId == null || String(event.sessionId ?? event.mediaSession) === String(sessionId)));
}

function classifyTimeline({ events, playerEvents = [], deadlines = {}, sessionId }) {
  const scoped = events.filter((event) => !sessionId
    || String(event.sessionId ?? event.mediaSession) === String(sessionId))
    .sort(compareEvents);
  const player = playerEvents.slice().sort((left, right) => left.at - right.at);
  const firstFrame = player.find((event) => event.kind === 'first-frame');
  const seekFrame = player.find((event) => event.kind === 'seek-frame');
  const close = player.find((event) => event.kind === 'close-success');
  const appFirstFrame = eventFor(scoped, 'first-decoded-frame');
  const appSeekFrame = eventFor(scoped, 'seek-frame');
  const appClose = scoped.find((event) => event.stage === 'trace-finished' && event.reason === 'closed');
  if ((firstFrame && seekFrame && close) || (appFirstFrame && appSeekFrame && appClose)) return {
    classification: 'playable',
    terminalStage: appClose ? 'trace-finished' : 'close-success',
    at: (appClose || close).at
  };

  const completedRequestIds = new Set(scoped
    .filter((event) => event.stage === 'body-complete' && event.requestId)
    .map((event) => event.requestId));
  const terminalCandidates = [];
  for (const event of scoped) {
    if (event.stage === 'credential-missing') {
      terminalCandidates.push({ classification: 'credential-missing', event });
    } else if (event.stage === 'http-error') {
      const requestHasHeaders = scoped.some((candidate) => candidate.stage === 'headers'
        && candidate.requestId === event.requestId && compareEvents(candidate, event) <= 0);
      terminalCandidates.push({
        classification: !requestHasHeaders && Number(event.status) === 0
          ? 'headers-network-failure'
          : `http-${event.status || 'error'}`,
        event
      });
    } else if (event.stage === 'range-error') {
      terminalCandidates.push({ classification: 'range-error', event });
    } else if (event.stage === 'body-error') {
      terminalCandidates.push({ classification: 'body-read-failed', event });
    } else if (event.stage === 'request-cancelled') {
      const anotherRequestContinued = scoped.some((candidate) => candidate.requestId
        && candidate.requestId !== event.requestId && compareEvents(candidate, event) > 0);
      if (!anotherRequestContinued) terminalCandidates.push({ classification: 'cancelled', event });
    } else if (event.stage === 'media-error-classified' && event.terminal === true) {
      terminalCandidates.push({
        classification: event.reason === 'container-or-decoder'
          ? 'container-or-decoder'
          : `media-${event.reason || 'error'}`,
        event
      });
    }
  }

  const mediaError = player.find((event) => event.kind === 'media-error' && event.code === 4);
  if (mediaError) terminalCandidates.push({ classification: 'container-or-decoder', event: {
    stage: 'media-error', at: mediaError.at, sequence: Number.MAX_SAFE_INTEGER
  } });

  const requests = new Map();
  for (const event of scoped) {
    if (!event.requestId) continue;
    if (!requests.has(event.requestId)) requests.set(event.requestId, []);
    requests.get(event.requestId).push(event);
  }
  for (const requestEvents of requests.values()) {
    const requestStart = eventFor(requestEvents, 'request-start');
    const headers = eventFor(requestEvents, 'headers');
    const firstByte = eventFor(requestEvents, 'first-byte');
    const bodyProgress = requestEvents
      .filter((event) => event.stage === 'body-progress' || event.stage === 'first-byte')
      .sort((left, right) => compareEvents(right, left))[0];
    const bodyComplete = eventFor(requestEvents, 'body-complete');
    if (requestStart && headers
      && headers.at - requestStart.at >= Number(deadlines.headersMs || Infinity)) {
      terminalCandidates.push({ classification: 'headers-delayed', event: headers });
    }
    if (headers && firstByte
      && firstByte.at - headers.at >= Number(deadlines.firstByteMs || Infinity)) {
      terminalCandidates.push({ classification: 'first-byte-delayed', event: firstByte });
    }
    if (bodyProgress && !bodyComplete
      && Number(deadlines.observedAt) - bodyProgress.at >= Number(deadlines.bodyNoProgressMs || Infinity)) {
      terminalCandidates.push({ classification: 'body-stalled', event: {
        stage: 'body-no-progress-deadline', at: Number(deadlines.observedAt),
        sequence: Number.MAX_SAFE_INTEGER
      } });
    }
  }

  // A completed alternative request without a resolved player outcome means
  // the playback is still in progress; a failed sibling Range is not terminal.
  const hasPlaybackOrTimingTerminal = terminalCandidates.some(({ classification, event }) => (
    event.stage === 'media-error' || event.stage === 'media-error-classified'
    || ['headers-delayed', 'first-byte-delayed', 'body-stalled'].includes(classification)
  ));
  if (completedRequestIds.size > 0 && !hasPlaybackOrTimingTerminal) {
    return { classification: 'incomplete', terminalStage: null, at: null };
  }

  terminalCandidates.sort((left, right) => compareEvents(left.event, right.event));
  if (terminalCandidates.length) {
    const first = terminalCandidates[0];
    return terminal(first.classification, first.event);
  }

  return { classification: 'incomplete', terminalStage: null, at: null };
}

function compareEvents(left, right) {
  const time = Number(left?.at) - Number(right?.at);
  if (Number.isFinite(time) && time !== 0) return time;
  return (Number(left?.sequence) || 0) - (Number(right?.sequence) || 0);
}

function terminal(classification, event) {
  return { classification, terminalStage: event.stage, at: event.at };
}

function redactTraceEvent(event, { traceId, allowedSessions }) {
  assert.equal(event?.type, 'MEDIA_TRACE_EVENT', 'trace type must be MEDIA_TRACE_EVENT');
  assert.equal(event.traceId, traceId, 'traceId must correlate with the requested trace');
  assert.ok(TRACE_STAGES.has(event.stage), `unknown trace stage: ${event.stage}`);
  assert.ok(typeof event.requestId === 'string' && event.requestId.length > 0, 'requestId is required');
  assert.ok(typeof event.sessionId === 'string' && event.sessionId.length > 0, 'sessionId is required');
  assert.equal(event.mediaSession, event.sessionId, 'mediaSession must mirror sessionId');
  assert.ok(allowedSessions.has(event.sessionId), 'event belongs to an unexpected session');
  assert.ok(Number.isInteger(event.sequence) && event.sequence > 0, 'sequence must be a positive integer');
  assert.ok(Number.isFinite(event.at), 'at must be a finite fixture-clock timestamp');
  for (const key of Object.keys(event)) assert.ok(TRACE_FIELDS.has(key), `trace leaked unsupported field: ${key}`);
  return Object.fromEntries(Object.entries(event).filter(([key]) => TRACE_FIELDS.has(key)));
}

function assertOrdered(events) {
  const sequences = new Map();
  for (const event of events) {
    const prior = sequences.get(event.requestId) || 0;
    assert.ok(event.sequence > prior, 'sequence must strictly increase per request');
    sequences.set(event.requestId, event.sequence);
  }
}

module.exports = { TRACE_STAGES, classifyTimeline, redactTraceEvent, assertOrdered };
