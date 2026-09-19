'use strict';

/*
 * V2-01B: local-only stage-boundary fixture. It loads the current service worker
 * in a VM and never contacts Drive. The generated JSON intentionally carries
 * only opaque fixture correlations and byte counts, never request identities or
 * credential/media material.
 */

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { classifyTimeline, redactTraceEvent, assertOrdered } = require('./lib/media-stage-classifier.cjs');

const ROOT = path.join(__dirname, '..');
const SOURCE_PATH = path.join(ROOT, 'sw.js');
const APP_SOURCE_PATH = path.join(ROOT, 'app.js');
const OUTPUT_DIR = path.join(__dirname, 'player-stage-v2-01b');
const OUTPUT_PATH = path.join(OUTPUT_DIR, 'results.json');
const FIXTURE_LABEL = 'V2-01B-local-stage-boundary';
const OPAQUE_FILE_SEGMENT = 'fixtureAsset';
const SENSITIVE_RESULT_MARKERS = [
  'googleapis.com', 'fixtureAsset', 'fixture-private-file', 'fixture-private-token',
  'fixture-private-source', 'fixture-secret',
  'Authorization:', 'Bearer ', 'Cookie:'
];

class FixtureClock {
  constructor(start = 10_000) {
    this.now = start;
    this.nextId = 1;
    this.jobs = new Map();
  }

  setTimeout(callback, delay = 0) {
    const id = this.nextId++;
    this.jobs.set(id, { at: this.now + Number(delay || 0), callback });
    return id;
  }

  clearTimeout(id) { this.jobs.delete(id); }

  advance(milliseconds) {
    const target = this.now + Number(milliseconds);
    while (true) {
      const due = [...this.jobs.entries()]
        .filter(([, job]) => job.at <= target)
        .sort((left, right) => left[1].at - right[1].at || left[0] - right[0])[0];
      if (!due) break;
      const [id, job] = due;
      this.jobs.delete(id);
      this.now = job.at;
      job.callback();
    }
    this.now = target;
  }
}

class FixtureMessageChannel {
  constructor() {
    const port = () => ({ closed: false, onmessage: null, close() { this.closed = true; } });
    this.port1 = port();
    this.port2 = port();
    this.port1.postMessage = (data) => queueMicrotask(() => {
      if (!this.port2.closed) this.port2.onmessage?.({ data });
    });
    this.port2.postMessage = (data) => queueMicrotask(() => {
      if (!this.port1.closed) this.port1.onmessage?.({ data });
    });
  }
}

function controlledStream() {
  let controller;
  let cancelled = false;
  const stream = new ReadableStream({
    start(next) { controller = next; },
    cancel() { cancelled = true; }
  });
  return {
    stream,
    enqueue(bytes) { if (!cancelled) controller.enqueue(new Uint8Array(Number(bytes))); },
    close() { if (!cancelled) controller.close(); },
    error(reason) { if (!cancelled) controller.error(reason); },
    get cancelled() { return cancelled; }
  };
}

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function makeDate(clock) {
  return class FixtureDate extends Date {
    static now() { return clock.now; }
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((onResolve, onReject) => { resolve = onResolve; reject = onReject; });
  return { promise, resolve, reject };
}

function drainMicrotasks() {
  return new Promise((resolve) => setImmediate(resolve));
}

function makeWorker(fetchImpl) {
  const source = fs.readFileSync(SOURCE_PATH, 'utf8');
  const clock = new FixtureClock();
  const listeners = new Map();
  const clients = new Map();
  const fetchCalls = [];
  const context = {
    URL, Headers, Request, Response, ReadableStream, Uint8Array, Map, Number, Boolean,
    Date: makeDate(clock), MessageChannel: FixtureMessageChannel,
    setTimeout: clock.setTimeout.bind(clock), clearTimeout: clock.clearTimeout.bind(clock),
    self: {
      location: { origin: 'https://fixture.invalid', href: 'https://fixture.invalid/' },
      registration: { scope: 'https://fixture.invalid/' },
      addEventListener(type, callback) { listeners.set(type, callback); },
      clients: { async get(id) { return clients.get(id); } }
    },
    fetch(url, options) {
      fetchCalls.push({ attempt: fetchCalls.length + 1, method: options.method, range: options.headers.get('Range') });
      return fetchImpl({ attempt: fetchCalls.length, signal: options.signal, clock });
    }
  };
  vm.createContext(context);
  vm.runInContext(source, context, { filename: 'sw.js' });

  const worker = {
    clock,
    fetchCalls,
    addClient(id, responder) {
      const messages = [];
      clients.set(id, {
        id,
        postMessage(message, ports = []) {
          messages.push(message);
          if (message.type === 'TOKEN_REQUEST') responder?.(message, ports[0], worker);
        }
      });
      return messages;
    },
    send(id, data) { listeners.get('message')({ source: id ? { id } : null, data }); },
    request(clientId, { traceId, sessionId, controller = new AbortController() }) {
      const request = new Request(
        `https://fixture.invalid/__drive_media/${OPAQUE_FILE_SEGMENT}?mime=video%2Fmp4&mediaSession=${encodeURIComponent(sessionId)}&_trace=${encodeURIComponent(traceId)}&size=64`,
        { headers: { Range: 'bytes=0-15' }, signal: controller.signal }
      );
      let response;
      listeners.get('fetch')({ clientId, request, respondWith(value) { response = value; } });
      return { controller, response };
    }
  };
  return worker;
}

function makeAppTraceHarness(sessionId = 31) {
  const events = [];
  const storage = new Map();
  const context = {
    AbortController, Blob, DOMException, Headers, Map, Math, Promise, Response, Set,
    URL, URLSearchParams, clearInterval, clearTimeout, console, fetch, performance,
    requestAnimationFrame(callback) { callback(); return 1; },
    setInterval, setTimeout,
    history: { replaceState() {} },
    location: {
      hash: '', href: 'https://fixture.invalid/', origin: 'https://fixture.invalid',
      pathname: '/', protocol: 'https:', search: ''
    },
    localStorage: {
      getItem(key) { return storage.get(key) ?? null; },
      removeItem(key) { storage.delete(key); },
      setItem(key, value) { storage.set(key, String(value)); }
    },
    navigator: { onLine: true },
    __fixtureEvents: events
  };
  context.window = {
    addEventListener() {}, isSecureContext: true, location: context.location,
    matchMedia() { return { matches: false }; }, removeEventListener() {}, setTimeout
  };
  context.document = { addEventListener() {}, querySelectorAll() { return []; } };
  context.matchMedia = context.window.matchMedia;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(APP_SOURCE_PATH, 'utf8'), context, { filename: 'app.js' });
  vm.runInContext(`
    globalThis.__driveOriginalMediaTraceSink = (event) => globalThis.__fixtureEvents.push(event);
    state.selected = { id: 'fixture-private-file', mimeType: 'video/mp4', size: '16' };
    state.mediaSession = ${Number(sessionId)};
    beginMediaDiagnosticTrace(state.selected, state.mediaSession, Date.now());
  `, context);
  const traceId = vm.runInContext('mediaDiagnosticTrace.traceId', context);
  return {
    traceId,
    forward(message) {
      context.__fixtureMessage = message;
      vm.runInContext('forwardWorkerMediaDiagnostic(globalThis.__fixtureMessage)', context);
      delete context.__fixtureMessage;
    },
    updateSession(nextSession, reason = 'fixture-session-change') {
      context.__fixtureNextSession = Number(nextSession);
      context.__fixtureSessionReason = String(reason);
      vm.runInContext(`
        state.mediaSession = globalThis.__fixtureNextSession;
        updateMediaDiagnosticSession(state.mediaSession, globalThis.__fixtureSessionReason);
      `, context);
      delete context.__fixtureNextSession;
      delete context.__fixtureSessionReason;
    },
    async classifyMediaError() {
      await vm.runInContext(`(async () => {
        state.mediaAttempt = 'range';
        state.lastProxyError = null;
        state.token = 'fixture-private-token';
        state.expiresAt = Date.now() + 60_000;
        el.videoPlayer = {
          error: { code: 4 },
          getAttribute(name) { return name === 'src' ? 'blob:fixture-private-source' : ''; }
        };
        window.setTimeout = (resolve) => { resolve(); return 1; };
        retryOriginalStream = () => {};
        await handleMediaElementError('video');
        finishMediaDiagnosticTrace('failed');
      })()`, context);
    },
    presentSeekAndClose() {
      vm.runInContext(`(() => {
        globalThis.__fixtureFrameCallbacks = [];
        const classes = new Set();
        const video = {
          hidden: false,
          currentTime: 0,
          dataset: { mediaSession: String(state.mediaSession) },
          classList: { add(name) { classes.add(name); }, remove(name) { classes.delete(name); } },
          removeAttribute() {},
          requestVideoFrameCallback(callback) { globalThis.__fixtureFrameCallbacks.push(callback); }
        };
        el.videoPlayer = video;
        el.imageViewer = { hidden: true };
        el.mediaLoading = { hidden: false };
        el.mediaError = { hidden: false };
        updateQualityDisplay = () => {};
        tryCaptureAmbientFrame = () => {};
        hideSwipeNeighbor = () => {};
        scheduleVideoFramePresentation(video, state.mediaSession);
        globalThis.__fixtureFrameCallbacks.shift()(0, { mediaTime: 0 });
        video.currentTime = 5;
        recordMediaDiagnosticSeekStart(video);
        recordMediaDiagnosticSeekEnd(video);
        globalThis.__fixtureFrameCallbacks.shift()(0, { mediaTime: 5 });
        finishMediaDiagnosticTrace('closed');
      })()`, context);
    },
    events() { return JSON.parse(JSON.stringify(events)); }
  };
}

function assertAppTrace(events, traceId, sessionIds) {
  assert.ok(events.length > 0, 'the integrated app trace emitted no events');
  const allowedSessions = new Set((Array.isArray(sessionIds) ? sessionIds : [sessionIds]).map(String));
  let priorSequence = 0;
  for (const event of events) {
    assert.equal(event.type, 'DRIVE_ORIGINAL_MEDIA_STAGE');
    assert.equal(event.traceId, traceId);
    assert.equal(event.playbackId, traceId);
    assert.ok(allowedSessions.has(event.mediaSession), 'app trace contains an unexpected media session');
    assert.ok(event.sequence > priorSequence, 'app trace sequence must strictly increase');
    priorSequence = event.sequence;
  }
  const serialized = JSON.stringify(events);
  for (const marker of SENSITIVE_RESULT_MARKERS) {
    assert.equal(serialized.includes(marker), false, `integrated app trace leaked: ${marker}`);
  }
  return events;
}

function replyCredential(message, port, worker, suffix = 'ready') {
  port.postMessage({
    type: 'TOKEN_RESPONSE', requestId: message.requestId,
    token: `fixture-secret-${suffix}`, expiresAt: worker.clock.now + 3_600_000
  });
}

function okStreamResponse(stage) {
  return new Response(stage.stream, {
    status: 206,
    headers: { 'Content-Range': 'bytes 0-15/64', 'Content-Length': '16' }
  });
}

async function traceMessages(messages, traceId, sessions) {
  await drainMicrotasks();
  const events = messages
    .filter((message) => message?.type === 'MEDIA_TRACE_EVENT')
    .map((message) => redactTraceEvent(message, { traceId, allowedSessions: new Set(sessions) }));
  assert.ok(events.length > 0, 'the opt-in worker trace emitted no events');
  assertOrdered(events);
  return events;
}

function assertStages(events, required, sessionId) {
  let cursor = -1;
  for (const stage of required) {
    cursor = events.findIndex((event, index) => index > cursor && event.stage === stage
      && (!sessionId || String(event.sessionId ?? event.mediaSession) === String(sessionId)));
    assert.notEqual(cursor, -1, `missing ordered trace stage: ${stage}`);
  }
}

function resultScenario({ id, expected, traceId, sessions, events, playerEvents = [], deadlines = {}, extraAssertions = [] }) {
  const classification = classifyTimeline({
    events, playerEvents, deadlines, sessionId: sessions[sessions.length - 1]
  });
  assert.equal(classification.classification, expected, `${id} terminal classification`);
  for (const check of extraAssertions) check();
  return {
    id,
    expectedTerminalClassification: expected,
    terminalClassification: classification.classification,
    terminalStage: classification.terminalStage,
    traceId,
    sessions,
    deadlines,
    events,
    playerEvents,
    assertions: ['trace-contract-redacted', 'session-correlated', 'expected-terminal-classification']
  };
}

async function missingCredential() {
  const traceId = 'trace-missing';
  const sessionId = 'session-missing';
  const worker = makeWorker(() => { throw new Error('credential-missing must not fetch'); });
  const messages = worker.addClient('client-missing');
  const { response } = worker.request('client-missing', { traceId, sessionId });
  await drainMicrotasks();
  worker.clock.advance(1_500);
  assert.equal((await response).status, 401);
  const events = await traceMessages(messages, traceId, [sessionId]);
  assertStages(events, ['credential-requested', 'credential-missing'], sessionId);
  return resultScenario({
    id: 'missing-credential', expected: 'credential-missing', traceId, sessions: [sessionId], events,
    deadlines: { credentialMs: 1_500, observedAt: worker.clock.now },
    extraAssertions: [() => assert.equal(worker.fetchCalls.length, 0)]
  });
}

async function final401() {
  const traceId = 'trace-final-401';
  const sessionId = 'session-final-401';
  const worker = makeWorker(() => new Response('', { status: 401 }));
  const messages = worker.addClient('client-final-401', (message, port, fixture) => {
    replyCredential(message, port, fixture, message.forceRefresh ? 'second' : 'first');
  });
  const { response } = worker.request('client-final-401', { traceId, sessionId });
  assert.equal((await response).status, 401);
  const events = await traceMessages(messages, traceId, [sessionId]);
  assertStages(events, ['credential-requested', 'credential-ready', 'request-start', 'http-error'], sessionId);
  return resultScenario({
    id: 'final-401', expected: 'http-401', traceId, sessions: [sessionId], events,
    deadlines: { observedAt: worker.clock.now },
    extraAssertions: [() => assert.equal(worker.fetchCalls.length, 2)]
  });
}

async function supersededCancelThenFinal401() {
  const traceId = 'trace-cancel-then-401';
  const sessionId = 'session-cancel-then-401';
  const worker = makeWorker(({ attempt, signal }) => attempt === 1
    ? new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    })
    : new Response('', { status: 401 }));
  const messages = worker.addClient('client-cancel-then-401', (message, port, fixture) => {
    replyCredential(message, port, fixture, message.forceRefresh ? 'refreshed' : 'initial');
  });
  const superseded = worker.request('client-cancel-then-401', { traceId, sessionId });
  await drainMicrotasks();
  superseded.controller.abort(new DOMException('fixture superseded request', 'AbortError'));
  await assert.rejects(superseded.response, { name: 'AbortError' });
  const terminalRequest = worker.request('client-cancel-then-401', { traceId, sessionId });
  assert.equal((await terminalRequest.response).status, 401);
  const events = await traceMessages(messages, traceId, [sessionId]);
  assertStages(events, ['request-cancelled', 'request-start', 'http-error'], sessionId);
  return resultScenario({
    id: 'superseded-cancel-then-final-401', expected: 'http-401',
    traceId, sessions: [sessionId], events, deadlines: { observedAt: worker.clock.now }
  });
}

async function headersDelay() {
  const traceId = 'trace-headers-delay';
  const sessionId = 'session-headers-delay';
  const gate = deferred();
  const worker = makeWorker(() => gate.promise);
  const messages = worker.addClient('client-headers', replyCredential);
  const { response } = worker.request('client-headers', { traceId, sessionId });
  await drainMicrotasks();
  assert.equal(worker.fetchCalls.length, 1);
  worker.clock.advance(91);
  gate.resolve(new Response(new Uint8Array(16), {
    status: 206, headers: { 'Content-Range': 'bytes 0-15/64', 'Content-Length': '16' }
  }));
  await (await response).arrayBuffer();
  const events = await traceMessages(messages, traceId, [sessionId]);
  assertStages(events, ['request-start', 'headers', 'first-byte', 'body-complete'], sessionId);
  return resultScenario({
    id: 'headers-delay', expected: 'headers-delayed', traceId, sessions: [sessionId], events,
    deadlines: { headersMs: 90, observedAt: worker.clock.now }
  });
}

async function headersNetworkFailure() {
  const traceId = 'trace-headers-network';
  const sessionId = 'session-headers-network';
  const worker = makeWorker(() => Promise.reject(new TypeError('synthetic pre-header network failure')));
  const messages = worker.addClient('client-headers-network', replyCredential);
  const { response } = worker.request('client-headers-network', { traceId, sessionId });
  assert.equal((await response).status, 502);
  const events = await traceMessages(messages, traceId, [sessionId]);
  assertStages(events, ['credential-ready', 'request-start', 'http-error'], sessionId);
  assert.equal(events.some((event) => event.stage === 'headers'), false);
  return resultScenario({
    id: 'headers-network-failure', expected: 'headers-network-failure',
    traceId, sessions: [sessionId], events, deadlines: { observedAt: worker.clock.now }
  });
}

async function firstByteDelay() {
  const traceId = 'trace-first-byte-delay';
  const sessionId = 'session-first-byte-delay';
  const stream = controlledStream();
  const worker = makeWorker(() => okStreamResponse(stream));
  const messages = worker.addClient('client-first-byte', replyCredential);
  const { response } = worker.request('client-first-byte', { traceId, sessionId });
  const result = await response;
  const reader = result.body.getReader();
  const firstRead = reader.read();
  worker.clock.advance(73);
  stream.enqueue(16);
  await firstRead;
  stream.close();
  await reader.read();
  const events = await traceMessages(messages, traceId, [sessionId]);
  assertStages(events, ['headers', 'first-byte', 'body-complete'], sessionId);
  return resultScenario({
    id: 'first-byte-delay', expected: 'first-byte-delayed', traceId, sessions: [sessionId], events,
    deadlines: { firstByteMs: 72, observedAt: worker.clock.now }
  });
}

async function bodyStall() {
  const traceId = 'trace-body-stall';
  const sessionId = 'session-body-stall';
  const stream = controlledStream();
  const worker = makeWorker(() => okStreamResponse(stream));
  const messages = worker.addClient('client-body-stall', replyCredential);
  const { response } = worker.request('client-body-stall', { traceId, sessionId });
  const reader = (await response).body.getReader();
  const firstRead = reader.read();
  worker.clock.advance(7);
  // Deliver a true partial body below the 1 MiB reporting threshold, then stop.
  // The first-byte event itself is progress evidence for the no-progress clock.
  stream.enqueue(1);
  await firstRead;
  worker.clock.advance(120);
  const events = await traceMessages(messages, traceId, [sessionId]);
  assertStages(events, ['headers', 'first-byte'], sessionId);
  const scenario = resultScenario({
    id: 'body-stall', expected: 'body-stalled', traceId, sessions: [sessionId], events,
    deadlines: { bodyNoProgressMs: 120, observedAt: worker.clock.now },
    extraAssertions: [() => assert.equal(events.some((event) => event.stage === 'body-complete'), false)]
  });
  await reader.cancel();
  return scenario;
}

async function bodyReadFailure() {
  const traceId = 'trace-body-error';
  const sessionId = 'session-body-error';
  const stream = controlledStream();
  const worker = makeWorker(() => okStreamResponse(stream));
  const messages = worker.addClient('client-body-error', replyCredential);
  const { response } = worker.request('client-body-error', { traceId, sessionId });
  const reader = (await response).body.getReader();
  const firstRead = reader.read();
  worker.clock.advance(5);
  stream.enqueue(8);
  await firstRead;
  const failedRead = reader.read();
  stream.error(new Error('synthetic fixture body failure'));
  await assert.rejects(failedRead, /synthetic fixture body failure/);
  const events = await traceMessages(messages, traceId, [sessionId]);
  assertStages(events, ['headers', 'first-byte', 'body-error'], sessionId);
  return resultScenario({
    id: 'body-read-failure', expected: 'body-read-failed', traceId, sessions: [sessionId], events,
    deadlines: { observedAt: worker.clock.now }
  });
}

async function consumerCancelAfterHeaders() {
  const traceId = 'trace-consumer-cancel';
  const sessionId = 'session-consumer-cancel';
  const stream = controlledStream();
  const worker = makeWorker(() => okStreamResponse(stream));
  const messages = worker.addClient('client-consumer-cancel', replyCredential);
  const { response } = worker.request('client-consumer-cancel', { traceId, sessionId });
  const reader = (await response).body.getReader();
  const firstRead = reader.read();
  worker.clock.advance(4);
  stream.enqueue(1);
  await firstRead;
  await reader.cancel('fixture consumer stopped');
  assert.equal(stream.cancelled, true, 'consumer cancellation must reach the upstream body');
  const events = await traceMessages(messages, traceId, [sessionId]);
  assertStages(events, ['headers', 'first-byte', 'request-cancelled'], sessionId);
  assert.equal(events.at(-1).reason, 'consumer-cancelled');
  return resultScenario({
    id: 'consumer-cancel-after-headers', expected: 'cancelled',
    traceId, sessions: [sessionId], events, deadlines: { observedAt: worker.clock.now }
  });
}

async function mediaError() {
  const sessionId = '32';
  const app = makeAppTraceHarness(Number(sessionId));
  const traceId = app.traceId;
  const stream = controlledStream();
  const worker = makeWorker(() => okStreamResponse(stream));
  const messages = worker.addClient('client-media-error', replyCredential);
  const { response } = worker.request('client-media-error', { traceId, sessionId });
  const reader = (await response).body.getReader();
  const read = reader.read();
  worker.clock.advance(4);
  stream.enqueue(16);
  await read;
  stream.close();
  await reader.read();
  const workerEvents = await traceMessages(messages, traceId, [sessionId]);
  for (const event of workerEvents) app.forward(event);
  await app.classifyMediaError();
  const events = assertAppTrace(app.events(), traceId, sessionId);
  assertStages(events, [
    'headers', 'first-byte', 'body-complete', 'media-error',
    'media-error-classified', 'trace-finished'
  ], sessionId);
  return resultScenario({
    id: 'valid-bytes-media-error-code-4', expected: 'container-or-decoder', traceId, sessions: [sessionId], events,
    deadlines: { observedAt: Date.now() }
  });
}

async function playable() {
  const sessionId = '31';
  const app = makeAppTraceHarness(Number(sessionId));
  const traceId = app.traceId;
  const stream = controlledStream();
  const worker = makeWorker(({ attempt, signal }) => attempt === 1
    ? new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    })
    : okStreamResponse(stream));
  const messages = worker.addClient('client-playable', replyCredential);
  const superseded = worker.request('client-playable', { traceId, sessionId });
  await drainMicrotasks();
  superseded.controller.abort(new DOMException('fixture superseded range', 'AbortError'));
  await assert.rejects(superseded.response, { name: 'AbortError' });
  const { response } = worker.request('client-playable', { traceId, sessionId });
  const reader = (await response).body.getReader();
  const read = reader.read();
  worker.clock.advance(3);
  stream.enqueue(16);
  await read;
  stream.close();
  await reader.read();
  const workerEvents = await traceMessages(messages, traceId, [sessionId]);
  for (const event of workerEvents) app.forward(event);
  app.presentSeekAndClose();
  const events = assertAppTrace(app.events(), traceId, sessionId);
  assertStages(events, [
    'credential-ready', 'request-cancelled', 'headers', 'first-byte', 'body-complete',
    'first-decoded-frame', 'seeking', 'seeked', 'seek-frame', 'trace-finished'
  ], sessionId);
  return resultScenario({
    id: 'playable-first-frame-seek-close', expected: 'playable', traceId, sessions: [sessionId], events,
    deadlines: { observedAt: Date.now() }
  });
}

async function staleSessionCancellation() {
  const staleSession = '51';
  const currentSession = '52';
  const app = makeAppTraceHarness(Number(staleSession));
  const traceId = app.traceId;
  const worker = makeWorker(({ attempt, signal }) => attempt === 1
    ? new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    })
    : new Response(new Uint8Array(16), {
      status: 206, headers: { 'Content-Range': 'bytes 0-15/64', 'Content-Length': '16' }
    }));
  const messages = worker.addClient('client-stale', replyCredential);
  const stale = worker.request('client-stale', { traceId, sessionId: staleSession });
  await drainMicrotasks();
  assert.equal(worker.fetchCalls.length, 1);
  stale.controller.abort(new DOMException('fixture close', 'AbortError'));
  await assert.rejects(stale.response, { name: 'AbortError' });
  const current = worker.request('client-stale', { traceId, sessionId: currentSession });
  await (await current.response).arrayBuffer();
  const workerEvents = await traceMessages(messages, traceId, [staleSession, currentSession]);
  app.updateSession(Number(currentSession), 'fixture-newer-session');
  for (const event of workerEvents) app.forward(event);
  app.presentSeekAndClose();
  const events = assertAppTrace(app.events(), traceId, [staleSession, currentSession]);
  assertStages(events, ['request-start', 'request-cancelled'], staleSession);
  assertStages(events, ['request-start', 'headers', 'body-complete'], currentSession);
  const staleClassification = classifyTimeline({ events, sessionId: staleSession });
  assert.equal(staleClassification.classification, 'cancelled');
  const currentClassification = classifyTimeline({ events, sessionId: currentSession });
  assert.equal(currentClassification.classification, 'playable');
  const staleTerminal = events.filter((event) => event.mediaSession === staleSession).at(-1);
  assert.equal(staleTerminal.stage, 'request-cancelled');
  assert.equal(staleTerminal.stale, true);
  const terminalClassification = staleClassification.classification === 'cancelled'
    && currentClassification.classification === 'playable'
    ? 'stale-session-cancelled'
    : 'incomplete';
  assert.equal(terminalClassification, 'stale-session-cancelled');
  return {
    id: 'stale-session-cancellation',
    expectedTerminalClassification: 'stale-session-cancelled',
    terminalClassification,
    terminalStage: 'request-cancelled',
    traceId,
    sessions: [staleSession, currentSession],
    deadlines: { observedAt: Date.now() },
    events,
    playerEvents: [],
    assertions: [
      'trace-contract-redacted', 'session-correlated', 'stale-session-cancelled',
      'newer-session-remains-playable'
    ]
  };
}

async function main() {
  const scenarios = [];
  for (const run of [
    missingCredential, final401, supersededCancelThenFinal401,
    headersDelay, headersNetworkFailure, firstByteDelay, bodyStall,
    bodyReadFailure, consumerCancelAfterHeaders, mediaError, playable, staleSessionCancellation
  ]) {
    scenarios.push(await run());
  }
  const result = {
    fixtureLabel: FIXTURE_LABEL,
    sourceIdentity: {
      baseHeadAtRun: require('node:child_process').execFileSync(
        'git', ['-C', ROOT, 'rev-parse', 'HEAD'], { encoding: 'utf8' }
      ).trim(),
      appSha256: sha256File(path.join(ROOT, 'app.js')),
      serviceWorkerSha256: sha256File(SOURCE_PATH)
    },
    evidenceLevel: 'deterministic-local-fixture',
    scenarios,
    redaction: {
      excluded: ['credential', 'authorization', 'cookie', 'raw-drive-url', 'file-id', 'file-name', 'media-bytes'],
      assertions: ['only-media-trace-contract-fields', 'opaque-session-and-trace-identifiers', 'no-sensitive-result-markers']
    },
    assertions: { scenariosPassed: scenarios.length, allExpectedTerminalClassificationsMatched: true }
  };
  const serialized = `${JSON.stringify(result, null, 2)}\n`;
  for (const marker of SENSITIVE_RESULT_MARKERS) assert.equal(serialized.includes(marker), false, `sensitive marker leaked: ${marker}`);
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, serialized);
  process.stdout.write(`V2-01B fixture passed: ${scenarios.length} scenarios\n${OUTPUT_PATH}\n`);
}

main().catch((error) => {
  process.stderr.write(`V2-01B fixture failed: ${error.stack || error.message}\n`);
  process.exitCode = 1;
});
