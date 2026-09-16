'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
const expiresAt = () => Date.now() + 3_600_000;

class TestMessageChannel {
  constructor() {
    const makePort = () => ({ closed: false, onmessage: null, close() { this.closed = true; } });
    this.port1 = makePort();
    this.port2 = makePort();
    this.port1.postMessage = (data) => queueMicrotask(() => {
      if (!this.port2.closed) this.port2.onmessage?.({ data });
    });
    this.port2.postMessage = (data) => queueMicrotask(() => {
      if (!this.port1.closed) this.port1.onmessage?.({ data });
    });
  }
}

function createWorker(fetchImpl) {
  const listeners = new Map();
  const clients = new Map();
  const calls = [];
  const context = {
    URL, Headers, Request, Response, Date, Map, Number, Boolean,
    setTimeout, clearTimeout, MessageChannel: TestMessageChannel,
    self: {
      location: { origin: 'https://app.test' },
      addEventListener(type, callback) { listeners.set(type, callback); },
      clients: { async get(id) { return clients.get(id); } }
    },
    async fetch(url, options) {
      calls.push({ url, ...options, headers: new Headers(options.headers) });
      return fetchImpl(url, options, calls.length);
    }
  };
  vm.createContext(context);
  vm.runInContext(source, context, { filename: 'sw.js' });
  const worker = {
    context, calls,
    addClient(id, onTokenRequest) {
      const messages = [];
      clients.set(id, {
        id,
        postMessage(message, ports = []) {
          messages.push(message);
          if (message.type === 'TOKEN_REQUEST') onTokenRequest?.(message, ports[0]);
        }
      });
      return messages;
    },
    message(id, data) { listeners.get('message')({ source: id ? { id } : null, data }); },
    setToken(id, token) { worker.message(id, { type: 'SET_TOKEN', token, expiresAt: expiresAt() }); },
    request(clientId, {
      fileId = 'fileA', range = 'bytes=100-199', signal, method = 'GET',
      sessionParam = 'mediaSession', acknowledgeAbuse = false
    } = {}) {
      const abuseQuery = acknowledgeAbuse ? '&acknowledgeAbuse=1' : '';
      const request = new Request(`https://app.test/__drive_media/${fileId}?mime=video%2Fmp4&resourceKey=raw-key&${sessionParam}=7${abuseQuery}`, {
        method, headers: { Range: range }, signal
      });
      let response;
      listeners.get('fetch')({ clientId, request, respondWith(value) { response = value; } });
      return { request, response };
    }
  };
  return worker;
}

function tokenReply(message, port, token = 'fresh') {
  port.postMessage({ type: 'TOKEN_RESPONSE', requestId: message.requestId, token, expiresAt: expiresAt() });
}

function errorResponse(status, reason = 'denied') {
  return new Response(JSON.stringify({ error: { errors: [{ reason }] } }), {
    status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' }
  });
}

function partialResponse(body = 'ok', contentRange = 'bytes 100-199/1000', headers = {}) {
  return new Response(body, {
    status: 206,
    headers: { 'Content-Range': contentRange, ...headers }
  });
}

test('401 refresh retries once with identical Range/resource key and fresh authorization', async () => {
  const worker = createWorker((url, options, attempt) => attempt === 1
    ? errorResponse(401)
    : partialResponse('original bytes'));
  const messages = worker.addClient('A', tokenReply);
  worker.setToken('A', 'old');
  const { request, response } = worker.request('A');
  const result = await response;
  assert.equal(result.status, 206);
  assert.equal(await result.text(), 'original bytes');
  assert.equal(result.headers.get('Content-Range'), 'bytes 100-199/1000');
  assert.equal(result.headers.get('Content-Type'), 'video/mp4');
  assert.match(result.headers.get('Cache-Control'), /no-store/);
  assert.equal(worker.calls.length, 2);
  assert.match(worker.calls[0].url, /supportsAllDrives=true/);
  assert.doesNotMatch(worker.calls[0].url, /acknowledgeAbuse/);
  assert.deepEqual(worker.calls.map((call) => call.headers.get('Authorization')), ['Bearer old', 'Bearer fresh']);
  for (const call of worker.calls) {
    assert.equal(call.headers.get('Range'), 'bytes=100-199');
    assert.equal(call.headers.get('X-Goog-Drive-Resource-Keys'), 'fileA/raw-key');
    assert.equal(call.signal, request.signal);
  }
  const tokenRequests = messages.filter((message) => message.type === 'TOKEN_REQUEST');
  assert.equal(tokenRequests.length, 1);
  assert.equal(tokenRequests[0].forceRefresh, true);
  assert.equal(tokenRequests[0].clientId, 'A');
  const status = messages.find((message) => message.type === 'MEDIA_PROXY_STATUS');
  assert.deepEqual({ ...status }, {
    type: 'MEDIA_PROXY_STATUS',
    fileId: 'fileA',
    sessionId: '7',
    mediaSession: '7',
    status: 206,
    requestedRange: 'bytes=100-199',
    contentRange: 'bytes 100-199/1000',
    rangeSatisfied: true,
    playbackMode: 'original-range'
  });
});

test('acknowledgeAbuse reaches Drive only after explicit opt-in and survives an auth replay', async () => {
  const worker = createWorker((url, options, attempt) => attempt === 1
    ? errorResponse(401)
    : partialResponse());
  worker.addClient('A', tokenReply);
  worker.setToken('A', 'old');
  assert.equal((await worker.request('A', { acknowledgeAbuse: true }).response).status, 206);
  assert.equal(worker.calls.length, 2);
  for (const call of worker.calls) {
    const driveUrl = new URL(call.url);
    assert.equal(driveUrl.searchParams.get('acknowledgeAbuse'), 'true');
    assert.equal(driveUrl.searchParams.get('supportsAllDrives'), 'true');
    assert.equal(call.headers.get('Range'), 'bytes=100-199');
    assert.equal(call.headers.get('X-Goog-Drive-Resource-Keys'), 'fileA/raw-key');
  }
});

test('tokens and CLEAR_TOKEN are scoped to the source client', async () => {
  const worker = createWorker(() => partialResponse());
  worker.addClient('A', tokenReply);
  const bMessages = worker.addClient('B', (message, port) => tokenReply(message, port, 'B-recovered'));
  worker.setToken('A', 'A-token');
  worker.setToken('B', 'B-token');
  worker.message('A', { type: 'CLEAR_TOKEN' });
  await worker.request('B').response;
  assert.equal(worker.calls[0].headers.get('Authorization'), 'Bearer B-token');
  assert.equal(bMessages.filter((message) => message.type === 'TOKEN_REQUEST').length, 0);
  await worker.request('A').response;
  assert.equal(worker.calls[1].headers.get('Authorization'), 'Bearer fresh');
});

test('worker restart resolves only the requesting client and requires the correlated response', async () => {
  const worker = createWorker(() => partialResponse());
  const aMessages = worker.addClient('A', (message, port) => {
    port.postMessage({ type: 'TOKEN_RESPONSE', requestId: 'wrong', token: 'wrong', expiresAt: expiresAt() });
    worker.message('B', { type: 'TOKEN_RESPONSE', requestId: message.requestId, token: 'B-token', expiresAt: expiresAt() });
    worker.message('A', { type: 'TOKEN_RESPONSE', requestId: message.requestId, token: 'A-token', expiresAt: expiresAt() });
  });
  const bMessages = worker.addClient('B');
  await worker.request('A').response;
  assert.equal(worker.calls[0].headers.get('Authorization'), 'Bearer A-token');
  assert.equal(aMessages[0].forceRefresh, false);
  assert.equal(bMessages.length, 0);
});

test('missing client identity fails closed without borrowing another client token', async () => {
  const worker = createWorker(() => { throw new Error('must not fetch'); });
  const messages = worker.addClient('A');
  worker.setToken('A', 'A-token');
  const response = await worker.request('').response;
  assert.equal(response.status, 401);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(worker.calls.length, 0);
  assert.equal(messages.length, 0);
});

test('a Range request answered with 200 is reported as original sequential playback without synthetic range support', async () => {
  const worker = createWorker(() => new Response('whole original', { status: 200 }));
  const messages = worker.addClient('A');
  worker.setToken('A', 'valid');
  const response = await worker.request('A').response;
  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'whole original');
  assert.equal(response.headers.get('Accept-Ranges'), null);
  assert.deepEqual({ ...messages.find((message) => message.type === 'MEDIA_PROXY_STATUS') }, {
    type: 'MEDIA_PROXY_STATUS',
    fileId: 'fileA',
    sessionId: '7',
    mediaSession: '7',
    status: 200,
    requestedRange: 'bytes=100-199',
    contentRange: null,
    rangeSatisfied: false,
    playbackMode: 'original-sequential'
  });
});

test('a missing or mismatched Content-Range on 206 is rejected as range-invalid', async () => {
  for (const contentRange of [null, 'bytes 200-299/1000']) {
    const worker = createWorker(() => contentRange
      ? partialResponse('wrong bytes', contentRange)
      : new Response('unproven bytes', { status: 206 }));
    const messages = worker.addClient('A');
    worker.setToken('A', 'valid');
    const response = await worker.request('A').response;
    assert.equal(response.status, 502);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.equal(messages.some((message) => message.type === 'MEDIA_PROXY_STATUS'), false);
    const failure = messages.find((message) => message.type === 'MEDIA_PROXY_ERROR');
    assert.equal(failure.status, 206);
    assert.equal(failure.category, 'range-invalid');
    assert.equal(failure.driveReason, 'rangeInvalid');
    assert.equal(failure.requestedRange, 'bytes=100-199');
    assert.equal(failure.contentRange, contentRange);
    assert.equal(failure.rangeSatisfied, false);
    assert.equal(failure.sessionId, '7');
  }
});

test('open-ended and suffix byte ranges accept valid contained 206 responses', async () => {
  for (const [range, contentRange] of [
    ['bytes=0-', 'bytes 0-499/1000'],
    ['bytes=-100', 'bytes 900-999/1000']
  ]) {
    const worker = createWorker(() => partialResponse('range bytes', contentRange));
    const messages = worker.addClient('A');
    worker.setToken('A', 'valid');
    assert.equal((await worker.request('A', { range }).response).status, 206);
    const status = messages.find((message) => message.type === 'MEDIA_PROXY_STATUS');
    assert.equal(status.rangeSatisfied, true);
    assert.equal(status.requestedRange, range);
    assert.equal(status.contentRange, contentRange);
  }
});

test('416 preserves the unsatisfied size and reports structured range metadata', async () => {
  const worker = createWorker(() => new Response('outside file', {
    status: 416,
    headers: { 'Content-Range': 'bytes */1000', 'Retry-After': '2' }
  }));
  const messages = worker.addClient('A');
  worker.setToken('A', 'valid');
  const response = await worker.request('A', { sessionParam: 'session' }).response;
  assert.equal(response.status, 416);
  assert.equal(response.headers.get('Content-Range'), 'bytes */1000');
  const failure = messages.find((message) => message.type === 'MEDIA_PROXY_ERROR');
  assert.equal(failure.category, 'range-unsatisfiable');
  assert.equal(failure.status, 416);
  assert.equal(failure.driveReason, 'rangeNotSatisfiable');
  assert.equal(failure.requestedRange, 'bytes=100-199');
  assert.equal(failure.contentRange, 'bytes */1000');
  assert.equal(failure.rangeSatisfied, false);
  assert.equal(failure.retryAfterMs, 2000);
  assert.equal(failure.sessionId, '7');
  assert.equal(failure.mediaSession, '7');
});

test('error status, JSON MIME and reasons survive and notify only the requesting window', async () => {
  for (const [status, category] of [[401, 'auth'], [403, 'permission'], [404, 'not-found'], [429, 'rate-limit'], [503, 'server']]) {
    const worker = createWorker(() => errorResponse(status, 'apiReason'));
    const messages = worker.addClient('A', tokenReply);
    const otherMessages = worker.addClient('B');
    worker.setToken('A', 'old');
    const response = await worker.request('A').response;
    assert.equal(response.status, status);
    assert.equal(response.headers.get('Content-Type'), 'application/json');
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.equal(response.headers.get('Accept-Ranges'), null);
    assert.equal((await response.json()).error.errors[0].reason, 'apiReason');
    const failures = messages.filter((message) => message.type === 'MEDIA_PROXY_ERROR');
    assert.equal(failures.length, 1);
    assert.equal(failures[0].status, status);
    assert.equal(failures[0].category, category);
    assert.equal(failures[0].fileId, 'fileA');
    assert.equal(failures[0].clientId, 'A');
    assert.equal(failures[0].mediaSession, '7');
    assert.equal(failures[0].sessionId, '7');
    assert.equal(failures[0].driveReason, 'apiReason');
    assert.equal(failures[0].requestedRange, 'bytes=100-199');
    assert.equal(failures[0].contentRange, null);
    assert.equal(failures[0].rangeSatisfied, false);
    assert.equal(failures[0].retryAfterMs, 0);
    assert.match(failures[0].requestId, /^media-/);
    assert.deepEqual(Array.from(failures[0].reasons), ['apiReason']);
    assert.equal(otherMessages.length, 0);
    assert.equal(worker.calls.length, status === 401 ? 2 : 1);
  }
});

test('failed refresh does not retry the rejected token', async () => {
  for (const returnedToken of [null, 'old']) {
    const worker = createWorker(() => errorResponse(401));
    const messages = worker.addClient('A', (message, port) => tokenReply(message, port, returnedToken));
    worker.setToken('A', 'old');
    assert.equal((await worker.request('A').response).status, 401);
    assert.equal(worker.calls.length, 1);
    assert.equal(messages.filter((message) => message.type === 'MEDIA_PROXY_ERROR').length, 1);
  }
});

test('403 rate limits are classified separately and preserve Retry-After timing', async () => {
  const worker = createWorker(() => new Response(JSON.stringify({
    error: { errors: [{ reason: 'rateLimitExceeded' }] }
  }), {
    status: 403,
    headers: { 'Content-Type': 'application/json', 'Retry-After': '3' }
  }));
  const messages = worker.addClient('A');
  worker.setToken('A', 'valid');
  assert.equal((await worker.request('A').response).status, 403);
  const failure = messages.find((message) => message.type === 'MEDIA_PROXY_ERROR');
  assert.equal(failure.category, 'rate-limit');
  assert.equal(failure.retryAfterMs, 3000);
  assert.equal(vm.runInContext("parseRetryAfterMs('120', 0)", worker.context), 120000);
  assert.equal(
    vm.runInContext("parseRetryAfterMs('Wed, 21 Oct 2015 07:28:00 GMT', Date.parse('Wed, 21 Oct 2015 07:27:55 GMT'))", worker.context),
    5000
  );
});

test('aborting a media request aborts upstream and emits no false server/auth failure', async () => {
  let upstreamStarted;
  const started = new Promise((resolve) => { upstreamStarted = resolve; });
  const worker = createWorker((url, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    upstreamStarted();
  }));
  const messages = worker.addClient('A');
  worker.setToken('A', 'A-token');
  const controller = new AbortController();
  const { response } = worker.request('A', { signal: controller.signal });
  await started;
  controller.abort();
  await assert.rejects(response, { name: 'AbortError' });
  assert.equal(worker.calls[0].signal.aborted, true);
  assert.equal(messages.length, 0);
});

test('abort while waiting for a token closes the request without an auth notification', async () => {
  let tokenRequested;
  const requested = new Promise((resolve) => { tokenRequested = resolve; });
  const worker = createWorker(() => { throw new Error('must not fetch'); });
  const messages = worker.addClient('A', tokenRequested);
  const controller = new AbortController();
  const { response } = worker.request('A', { signal: controller.signal });
  await requested;
  controller.abort();
  await assert.rejects(response, { name: 'AbortError' });
  assert.equal(messages.filter((message) => message.type === 'MEDIA_PROXY_ERROR').length, 0);
  assert.equal(vm.runInContext('tokenRequests.size', worker.context), 0);
});

test('CLEAR_TOKEN cancels pending token replies so a late callback cannot restore credentials', async () => {
  const worker = createWorker(() => { throw new Error('must not fetch'); });
  worker.addClient('A', (message, port) => {
    worker.message('A', { type: 'CLEAR_TOKEN' });
    tokenReply(message, port, 'late');
  });
  assert.equal((await worker.request('A').response).status, 401);
  assert.equal(vm.runInContext('clientTokens.has("A")', worker.context), false);
});

test('HEAD remains bodyless and network failures are not exposed or cached', async () => {
  const headWorker = createWorker(() => new Response(null, { status: 200 }));
  headWorker.addClient('A');
  headWorker.setToken('A', 'valid');
  const head = await headWorker.request('A', { method: 'HEAD' }).response;
  assert.equal(head.status, 200);
  assert.equal(head.body, null);
  const failedWorker = createWorker(() => { throw new Error('private-network-detail'); });
  const messages = failedWorker.addClient('A');
  failedWorker.setToken('A', 'valid');
  const failed = await failedWorker.request('A').response;
  assert.equal(failed.status, 502);
  assert.equal(failed.headers.get('Cache-Control'), 'no-store');
  assert.doesNotMatch(await failed.text(), /private-network-detail/);
  assert.equal(messages[0].status, 0);
  assert.equal(messages[0].category, 'network');
  assert.equal(messages[0].driveReason, 'networkFailure');
});
