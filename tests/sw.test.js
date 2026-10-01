'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
const AUTH_PROTOCOL = 'drive-original-auth-v1';
const expiresAt = () => Date.now() + 3_600_000;

function accountForClient(clientId) {
  return `${clientId || 'unknown'}-account`;
}

function credentialEnvelope(type, {
  clientId = 'A', token = 'fresh', expiration = expiresAt(), account,
  revision = 1, accountGeneration = 1, requestId
} = {}) {
  return {
    type,
    ...(requestId ? { requestId } : {}),
    credentialProtocol: AUTH_PROTOCOL,
    token,
    expiresAt: expiration,
    account: account || accountForClient(clientId),
    revision,
    accountGeneration
  };
}

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

function createWorker(fetchImpl, {
  setTimeoutImpl = setTimeout,
  clearTimeoutImpl = clearTimeout
} = {}) {
  const listeners = new Map();
  const clients = new Map();
  const calls = [];
  const context = {
    URL, Headers, Request, Response, ReadableStream, Date, Map, Number, Boolean, TextDecoder, Uint8Array,
    AbortController, DOMException,
    setTimeout: setTimeoutImpl,
    clearTimeout: clearTimeoutImpl,
    MessageChannel: TestMessageChannel,
    importScripts(name) {
      assert.equal(name, './media/revision-pin.js');
      vm.runInContext(fs.readFileSync(path.join(__dirname, '../media/revision-pin.js'), 'utf8'), context);
    },
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
    message(id, data, ports = []) { listeners.get('message')({ source: id ? { id } : null, data, ports }); },
    retire(id, generation, overrides = {}) {
      const channel = new TestMessageChannel();
      const response = new Promise(resolve => { channel.port1.onmessage = ({ data }) => {
        channel.port1.close(); channel.port2.close(); resolve(data);
      }; });
      worker.message(id, { type: 'Q1_RETIRE_REQUEST', protocol: 'drive-original-q1-retirement-v1',
        requestId: 'retire-fixture', retiredThroughGeneration: generation, ...overrides }, [channel.port2]);
      return { channel, response };
    },
    setToken(id, token, overrides = {}) {
      worker.message(id, credentialEnvelope('SET_TOKEN', { clientId: id, token, ...overrides }));
    },
    clearToken(id, overrides = {}) {
      worker.message(id, {
        type: 'CLEAR_TOKEN',
        credentialProtocol: AUTH_PROTOCOL,
        account: overrides.account || accountForClient(id),
        revision: overrides.revision ?? 1,
        accountGeneration: overrides.accountGeneration ?? 1
      });
    },
    request(clientId, {
      fileId = 'fileA', range = 'bytes=100-199', signal, method = 'GET',
      sessionParam = 'mediaSession', acknowledgeAbuse = false, size = '1000', traceId = '',
      accountGeneration = 1, sourceGeneration = null, mediaOwner = null
    } = {}) {
      const abuseQuery = acknowledgeAbuse ? '&acknowledgeAbuse=1' : '';
      const sizeQuery = size == null ? '' : `&size=${encodeURIComponent(size)}`;
      const traceQuery = traceId ? `&_trace=${encodeURIComponent(traceId)}` : '';
      const ownerQuery = mediaOwner ? `&mediaOwner=${encodeURIComponent(mediaOwner)}` : '';
      const generationQuery = accountGeneration == null ? '' : `&accountGeneration=${encodeURIComponent(accountGeneration)}`;
      const sourceGenerationQuery = sourceGeneration == null
        ? ''
        : `&sourceGeneration=${encodeURIComponent(sourceGeneration)}`;
      const headers = new Headers();
      if (range != null) headers.set('Range', range);
      const request = new Request(`https://app.test/__drive_media/${fileId}?mime=video%2Fmp4&resourceKey=raw-key&${sessionParam}=7${generationQuery}${sourceGenerationQuery}${sizeQuery}${abuseQuery}${traceQuery}${ownerQuery}`, {
        method, headers, signal
      });
      let response;
      listeners.get('fetch')({ clientId, request, respondWith(value) { response = value; } });
      return { request, response };
    }
  };
  return worker;
}

function tokenResponse(message, token = 'fresh', overrides = {}) {
  return Object.assign(credentialEnvelope('TOKEN_RESPONSE', {
    clientId: message.clientId,
    token,
    requestId: message.requestId,
    revision: overrides.revision ?? (Number.isSafeInteger(message.rejectedRevision) ? message.rejectedRevision + 1 : 1),
    accountGeneration: overrides.accountGeneration ?? message.accountGeneration,
    account: overrides.account || message.expectedAccount || accountForClient(message.clientId),
    ...overrides
  }), message.requireCurrentMedia ? { q1RetirementProtocol: 'drive-original-q1-retirement-v1' } : {});
}

function tokenReply(message, port, token = 'fresh', overrides = {}) {
  port.postMessage(tokenResponse(message, token, overrides));
}

function errorResponse(status, reason = 'denied') {
  return new Response(JSON.stringify({ error: { errors: [{ reason }] } }), {
    status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' }
  });
}

function partialResponse(body = 'ok', contentRange = null, headers = {}) {
  const length = typeof body === 'string' ? Buffer.byteLength(body) : Number(body?.byteLength) || 0;
  const resolvedRange = contentRange || `bytes 100-${100 + length - 1}/1000`;
  return new Response(body, {
    status: 206,
    headers: { 'Content-Range': resolvedRange, ...headers }
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
  assert.equal(result.headers.get('Content-Range'), 'bytes 100-113/1000');
  assert.equal(result.headers.get('Content-Type'), 'video/mp4');
  assert.match(result.headers.get('Cache-Control'), /no-store/);
  assert.equal(worker.calls.length, 2);
  assert.match(worker.calls[0].url, /supportsAllDrives=true/);
  assert.doesNotMatch(worker.calls[0].url, /acknowledgeAbuse/);
  assert.deepEqual(worker.calls.map((call) => call.headers.get('Authorization')), ['Bearer old', 'Bearer fresh']);
  for (const call of worker.calls) {
    assert.equal(call.headers.get('Range'), 'bytes=100-199');
    assert.equal(call.headers.get('X-Goog-Drive-Resource-Keys'), 'fileA/raw-key');
    assert.notEqual(call.signal, request.signal);
    assert.equal(call.signal.aborted, false);
  }
  assert.equal(request.signal.aborted, false);
  const tokenRequests = messages.filter((message) => message.type === 'TOKEN_REQUEST');
  assert.equal(tokenRequests.length, 1);
  assert.equal(tokenRequests[0].forceRefresh, true);
  assert.equal(tokenRequests[0].clientId, 'A');
  const status = messages.find((message) => message.type === 'MEDIA_PROXY_STATUS');
  assert.deepEqual({ ...status }, {
    type: 'MEDIA_PROXY_STATUS',
    requestId: 'media-1',
    fileId: 'fileA',
    sessionId: '7',
    mediaSession: '7',
    status: 206,
    requestedRange: 'bytes=100-199',
    contentRange: 'bytes 100-113/1000',
    contentRangeInferred: false,
    rangeSatisfied: true,
    playbackMode: 'original-range'
  });
});

test('Q1 401 replay requires its current media lease even when SET_TOKEN already advanced the account cache', async () => {
  for (const advancedBeforeReply of [false, true]) {
    const worker = createWorker(() => {
      if (advancedBeforeReply) worker.setToken('A', 'fresh', { revision: 2 });
      return errorResponse(401);
    });
    let replies = 0;
    const messages = worker.addClient('A', (message, port) => {
      replies++;
      if (replies === 1) port.postMessage({ ...tokenResponse(message, 'old'), requestCurrent: true });
      else {
        worker.setToken('A', 'fresh', { revision: 2 });
        port.postMessage({ ...tokenResponse(message, 'fresh', { revision: 2 }), requestCurrent: false });
      }
    });
    worker.setToken('A', 'old');
    const result = await worker.request('A', { mediaOwner: 'q1', sourceGeneration: 3 }).response;
    assert.equal(result.status, 401);
    assert.equal(worker.calls.length, 1, 'closed media must not replay with a fresh shared credential');
    const requests = messages.filter(message => message.type === 'TOKEN_REQUEST');
    assert.equal(requests.length, 2);
    assert.equal(requests[1].forceRefresh, !advancedBeforeReply);
    assert.equal(requests[1].mediaSession, '7');
    assert.equal(requests[1].sourceGeneration, 3);
    assert.equal(vm.runInContext('tokenRequests.size', worker.context), 0);
  }
});

test('Q1 media cannot substitute a cached token for a missing affirmative owner response', async () => {
  const worker = createWorker(() => { throw new Error('must not fetch'); });
  worker.setToken('A', 'cached');
  worker.addClient('A', (message, port) => port.postMessage(tokenResponse(message, 'fresh')));
  assert.equal((await worker.request('A', { mediaOwner: 'q1', sourceGeneration: 3 }).response).status, 401);
  assert.equal(worker.calls.length, 0);
});

test('an old page affirmative Q1 token reply without retirement capability cannot start upstream transport', async () => {
  const worker = createWorker(() => { throw new Error('must not fetch'); });
  worker.setToken('A', 'cached');
  const messages = worker.addClient('A', (message, port) => port.postMessage({ ...tokenResponse(message), requestCurrent: true, q1RetirementProtocol: undefined }));
  assert.equal((await worker.request('A', { mediaOwner: 'q1', sourceGeneration: 3 }).response).status, 409);
  assert.equal(worker.calls.length, 0);
  assert.equal(vm.runInContext('q1TransportOwners.size', worker.context), 0);
  assert.equal(vm.runInContext('clientCredentials.get("A").token', worker.context), 'cached');
  assert.equal(messages.filter(message => message.type === 'TOKEN_REQUEST' && message.forceRefresh).length, 0);
  assert.equal(messages.find(message => message.type === 'MEDIA_PROXY_ERROR').category, 'client-upgrade-required');
});

test('Q1 rejected-body cleanup failures terminate without refresh and fence later reads even if the old response is abandoned', async () => {
  for (const mode of ['reject', 'timeout', 'abort']) {
    const scheduled = new Map(); let sequence = 0, release, reject, cancelStarted;
    const started = new Promise(resolve => { cancelStarted = resolve; });
    const gate = new Promise((resolve, no) => { release = resolve; reject = no; });
    const worker = createWorker((_url, _options, attempt) => attempt === 1
      ? new Response(new ReadableStream({ cancel() {
        cancelStarted(); return mode === 'reject' ? Promise.reject(new Error('private cancel detail')) : gate;
      } }), { status: 401 }) : partialResponse(), {
      setTimeoutImpl(callback, delay) { const id = ++sequence; scheduled.set(id, { callback, delay }); return id; },
      clearTimeoutImpl(id) { scheduled.delete(id); }
    });
    const messages = worker.addClient('A', (message, port) => port.postMessage({ ...tokenResponse(message), requestCurrent: true }));
    worker.setToken('A', 'old');
    const caller = new AbortController();
    const old = worker.request('A', { mediaOwner: 'q1', sourceGeneration: 3, signal: caller.signal }).response;
    await started;
    const replacement = worker.request('A', { mediaOwner: 'q1', sourceGeneration: 4 }).response;
    if (mode === 'timeout') {
      const timers = [...scheduled.values()]; assert.equal(timers.length, 1); assert.equal(timers[0].delay, 2000);
      timers[0].callback();
    } else if (mode === 'abort') {
      caller.abort();
      const timer = [...scheduled.values()].find(item => item.delay === 2000); assert.ok(timer); timer.callback();
    }
    // The page may discard old entirely. The worker's fence still rejects its
    // next source; a fresh SET_TOKEN/account revision must not clear uncertainty.
    const first = await old, next = await replacement;
    for (const response of [first, next]) {
      assert.equal(response.status, 502);
      assert.equal(response.headers.get('X-Drive-Original-Q1-Cleanup'), 'unconfirmed');
      assert.equal((await response.text()).includes('private cancel detail'), false);
    }
    worker.setToken('A', 'fresh', { revision: 9, accountGeneration: 2 });
    const later = await worker.request('A', { mediaOwner: 'q1', sourceGeneration: 5, accountGeneration: 2 }).response;
    assert.equal(later.headers.get('X-Drive-Original-Q1-Cleanup'), 'unconfirmed');
    assert.equal(worker.calls.length, 1); assert.equal(worker.calls[0].signal.aborted, true);
    assert.equal(messages.filter(message => message.type === 'TOKEN_REQUEST').length, 1);
    assert.equal(scheduled.size, 0);
    if (mode === 'timeout') reject(new Error('late private cancel'));
    else release();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(vm.runInContext('q1CleanupFences.has("A")', worker.context), true);
    // Generic media/thumbnail requests and a different Q1 client retain their
    // established transport behavior despite A's Q1-only fence.
    assert.equal((await worker.request('A', { accountGeneration: 2 }).response).status, 206);
    worker.addClient('B', (message, port) => port.postMessage({ ...tokenResponse(message), requestCurrent: true }));
    worker.setToken('B', 'other');
    assert.equal((await worker.request('B', { mediaOwner: 'q1', sourceGeneration: 1 }).response).status, 206);
  }
});

test('concurrent Q1 cleanup success cannot erase another pending or failed cleanup for the same client', async () => {
  for (const firstFinishes of [true, false]) {
  const scheduled = new Map(); let sequence = 0;
  const worker = createWorker(() => partialResponse(), {
    setTimeoutImpl(callback, delay) { const id = ++sequence; scheduled.set(id, { callback, delay }); return id; },
    clearTimeoutImpl(id) { scheduled.delete(id); }
  });
  worker.addClient('A');
  let resolveFirst, resolveSecond;
  const first = new Promise(resolve => { resolveFirst = resolve; });
  const second = new Promise(resolve => { resolveSecond = resolve; });
  worker.context.firstCleanup = { response: { body: { cancel: () => first } }, abort() {}, release() {} };
  worker.context.secondCleanup = { response: { body: { cancel: () => second } }, abort() {}, release() {} };
  const one = vm.runInContext('fenceQ1RejectedBody("A",firstCleanup)', worker.context);
  const two = vm.runInContext('fenceQ1RejectedBody("A",secondCleanup)', worker.context);
  (firstFinishes ? resolveFirst : resolveSecond)(); await new Promise(resolve => setImmediate(resolve));
  let done = false; (firstFinishes ? one : two).then(() => { done = true; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(done, false); assert.equal(vm.runInContext('q1CleanupFences.has("A")', worker.context), true);
  assert.equal(scheduled.size, 1);
  const timer = [...scheduled.values()][0]; assert.equal(timer.delay, 2000); timer.callback();
  // The remaining wall is a failure regardless of which cancel succeeded first.
  assert.equal(await one, false); assert.equal(await two, false);
  (firstFinishes ? resolveSecond : resolveFirst)(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(vm.runInContext('q1CleanupFences.has("A")', worker.context), true);
  worker.context.self.clients.get = async () => null;
  await vm.runInContext('pruneQ1CleanupFences()', worker.context);
  assert.equal(vm.runInContext('q1CleanupFences.size', worker.context), 0);
  }
});

test('successful Q1 rejected-body cleanup releases its fence and preserves one fresh same-Range replay', async () => {
  let release, began;
  const started = new Promise(resolve => { began = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const worker = createWorker((_url, _options, attempt) => attempt === 1
    ? new Response(new ReadableStream({ cancel() { began(); return gate; } }), { status: 401 }) : partialResponse());
  const messages = worker.addClient('A', (message, port) => port.postMessage({ ...tokenResponse(message), requestCurrent: true }));
  worker.setToken('A', 'old');
  const old = worker.request('A', { mediaOwner: 'q1', sourceGeneration: 3 }).response;
  await started;
  const next = worker.request('A', { mediaOwner: 'q1', sourceGeneration: 4 }).response;
  await new Promise(resolve => setImmediate(resolve)); assert.equal(worker.calls.length, 1);
  release(); assert.equal((await old).status, 206); assert.equal((await next).status, 206);
  assert.equal(worker.calls.length, 3);
  assert.equal(messages.filter(message => message.type === 'TOKEN_REQUEST' && message.forceRefresh).length, 1);
  assert.ok(worker.calls.every(call => call.headers.get('Range') === 'bytes=100-199'));
  assert.equal(vm.runInContext('q1CleanupFences.size', worker.context), 0);
});

test('Q1 retirement observes full EOF or actual cancellation, closes its ports and fences late old generations', async () => {
  for (const terminal of ['eof', 'cancel']) {
    let cancellations = 0;
    const worker = createWorker(() => terminal === 'eof' ? partialResponse() : new Response(new ReadableStream({
      cancel() { cancellations++; }
    }), { status: 206, headers: { 'Content-Range': 'bytes 100-199/1000', 'Content-Length': '100' } }));
    worker.addClient('A', (message, port) => port.postMessage({ ...tokenResponse(message), requestCurrent: true }));
    worker.setToken('A', 'old');
    const body = await worker.request('A', { mediaOwner: 'q1', sourceGeneration: 3 }).response;
    assert.equal(vm.runInContext('q1TransportOwners.size', worker.context), 1, 'headers are not retirement');
    if (terminal === 'eof') await body.text();
    const retirement = worker.retire('A', 3), reply = await retirement.response;
    assert.equal(reply.settled, true); assert.equal(reply.retiredThroughGeneration, 3);
    assert.equal(retirement.channel.port1.closed, true); assert.equal(retirement.channel.port2.closed, true);
    assert.equal(cancellations, terminal === 'cancel' ? 1 : 0);
    assert.equal(vm.runInContext('q1TransportOwners.size + q1CleanupFences.size', worker.context), 0);
    assert.equal((await worker.request('A', { mediaOwner: 'q1', sourceGeneration: 3 }).response).status, 409);
    assert.equal(worker.calls.length, 1, 'a fetch event after readiness cannot revive the retired generation');
  }
});

test('Q1 retirement cancels an owner/token await without cancelling any shared page credential operation', async () => {
  let reached, late;
  const started = new Promise(resolve => { reached = resolve; });
  const worker = createWorker(() => { throw new Error('must not fetch'); });
  worker.addClient('A', (message, port) => { late = () => port.postMessage({ ...tokenResponse(message), requestCurrent: true }); reached(); });
  worker.setToken('A', 'old');
  const old = worker.request('A', { mediaOwner: 'q1', sourceGeneration: 3 }).response;
  const failed = assert.rejects(old, { name: 'AbortError' });
  await started;
  const reply = await worker.retire('A', 3).response;
  assert.equal(reply.settled, true); await failed; late(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(worker.calls.length, 0);
  assert.equal(vm.runInContext('tokenRequests.size + q1TransportOwners.size + q1CleanupFences.size', worker.context), 0);
});

test('Q1 query-only retirement terminates an outstanding downstream read before acknowledging cancellation', async () => {
  for (const wrapper of ['instrument','finalize']) {
    let cancellations=0;
    const worker=createWorker(()=>new Response(new ReadableStream({cancel(){cancellations++}}),{
      status:206,headers:{'Content-Range':'bytes 100-199/1000','Content-Length':'100'}}));
    worker.addClient('A',(message,port)=>port.postMessage({...tokenResponse(message),requestCurrent:true}));
    worker.setToken('A','old');
    let stream;
    if(wrapper==='instrument')stream=(await worker.request('A',{mediaOwner:'q1',sourceGeneration:3}).response).body;
    else {
      worker.context.testBody=new ReadableStream({cancel(){cancellations++}});
      worker.context.testSignal=new AbortController().signal;
      stream=vm.runInContext(`finalizeMediaResponseBody(testBody,{release(){},abort(){}},
        registerQ1TransportOwner({clientId:'A',sourceGeneration:3,requestId:'manual'},testSignal))`,worker.context);
    }
    const pending=stream.getReader().read();
    const rejection=assert.rejects(pending,{name:'AbortError'});
    assert.equal((await worker.retire('A',3).response).settled,true);
    await rejection;assert.equal(cancellations,1);
    assert.equal(vm.runInContext('q1TransportOwners.size + q1CleanupFences.size',worker.context),0);
  }
});

test('Q1 retirement tracks before headers and a late ignored-abort callback cannot turn bounded failure into success', async () => {
  const timers = new Map(); let sequence = 0, arrived, deliver;
  const started = new Promise(resolve => { arrived = resolve; });
  const worker = createWorker(() => { arrived(); return new Promise(resolve => { deliver = resolve; }); }, {
    setTimeoutImpl(callback, delay) { const id = ++sequence; timers.set(id, { callback, delay }); return id; },
    clearTimeoutImpl(id) { timers.delete(id); }
  });
  worker.addClient('A', (message, port) => port.postMessage({ ...tokenResponse(message), requestCurrent: true }));
  worker.setToken('A', 'old');
  const old = worker.request('A', { mediaOwner: 'q1', sourceGeneration: 3 }).response;
  const failed = assert.rejects(old, { name: 'AbortError' });
  await started;
  assert.equal(vm.runInContext('q1TransportOwners.size', worker.context), 1);
  assert.equal(vm.runInContext('q1CleanupFences.size', worker.context), 0);
  const retirement = worker.retire('A', 3);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(worker.calls[0].signal.aborted, true);
  const wall = [...timers.values()].find(item => item.delay === 2000); assert.ok(wall); wall.callback();
  assert.equal((await retirement.response).settled, false);
  assert.equal(vm.runInContext('q1TransportOwners.size', worker.context), 1, 'an ignored callback remains observed');
  deliver(partialResponse()); await failed;
  assert.equal(vm.runInContext('q1TransportOwners.size', worker.context), 0);
  assert.equal(await vm.runInContext('waitForQ1CleanupFence("A")', worker.context), false);
  assert.equal((await worker.retire('A', 3).response).settled, false);
});

test('Q1 retirement is client and generation scoped and cannot cancel newer media', async () => {
  let cancellations = 0;
  const worker = createWorker(() => new Response(new ReadableStream({ cancel() { cancellations++; } }), {
    status: 206, headers: { 'Content-Range': 'bytes 100-199/1000', 'Content-Length': '100' }
  }));
  for (const id of ['A', 'B']) {
    worker.addClient(id, (message, port) => port.postMessage({ ...tokenResponse(message), requestCurrent: true })); worker.setToken(id, 'old');
  }
  const old = await worker.request('A', { mediaOwner: 'q1', sourceGeneration: 3 }).response;
  const newer = await worker.request('A', { mediaOwner: 'q1', sourceGeneration: 4 }).response;
  const other = await worker.request('B', { mediaOwner: 'q1', sourceGeneration: 2 }).response;
  assert.equal((await worker.retire('A', 3).response).settled, true);
  assert.equal(cancellations, 1);
  assert.deepEqual(worker.calls.slice(1).map(call => call.signal.aborted), [false, false]);
  assert.equal(vm.runInContext('q1TransportOwners.size', worker.context), 2);
  assert.equal((await worker.retire('A', 99, { protocol: 'wrong' }).response).settled, false);
  assert.equal(cancellations, 1);
  await newer.body.cancel(); await other.body.cancel();
  assert.equal(vm.runInContext('q1TransportOwners.size + q1CleanupFences.size', worker.context), 0);
});

test('Q1 retirement cannot acknowledge failed body cancellation or its later resolution', async () => {
  const timers = new Map(); let sequence = 0, release;
  const pending = new Promise(resolve => { release = resolve; });
  const worker = createWorker(() => new Response(new ReadableStream({ cancel: () => pending }), {
    status: 206, headers: { 'Content-Range': 'bytes 100-199/1000', 'Content-Length': '100' }
  }), { setTimeoutImpl(callback, delay) { const id = ++sequence; timers.set(id, { callback, delay }); return id; },
    clearTimeoutImpl(id) { timers.delete(id); } });
  worker.addClient('A', (message, port) => port.postMessage({ ...tokenResponse(message), requestCurrent: true })); worker.setToken('A', 'old');
  await worker.request('A', { mediaOwner: 'q1', sourceGeneration: 3 }).response;
  const retirement = worker.retire('A', 3);
  await new Promise(resolve => setImmediate(resolve));
  const walls = [...timers.values()].filter(item => item.delay === 2000); assert.ok(walls.length >= 1); walls.forEach(item => item.callback());
  assert.equal((await retirement.response).settled, false);
  release(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(await vm.runInContext('waitForQ1CleanupFence("A")', worker.context), false);
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

test('credentials and CLEAR_TOKEN are scoped to the source client', async () => {
  const worker = createWorker(() => partialResponse());
  const aMessages = worker.addClient('A', tokenReply);
  const bMessages = worker.addClient('B', (message, port) => tokenReply(message, port, 'B-recovered'));
  worker.setToken('A', 'A-token');
  worker.setToken('B', 'B-token');
  worker.clearToken('A');
  await worker.request('B').response;
  assert.equal(worker.calls[0].headers.get('Authorization'), 'Bearer B-token');
  assert.equal(bMessages.filter((message) => message.type === 'TOKEN_REQUEST').length, 0);
  await worker.request('A').response;
  assert.equal(worker.calls[1].headers.get('Authorization'), 'Bearer fresh');
  assert.equal(aMessages.filter((message) => message.type === 'TOKEN_REQUEST').length, 1);
});

test('stale and conflicting credential revisions cannot replace the newest client credential', async () => {
  const worker = createWorker(() => partialResponse());
  worker.addClient('A');
  worker.setToken('A', 'newest', { revision: 5 });
  worker.setToken('A', 'lower-revision', { revision: 4 });
  worker.setToken('A', 'conflicting-same-revision', { revision: 5 });

  assert.equal((await worker.request('A').response).status, 206);
  assert.equal(worker.calls[0].headers.get('Authorization'), 'Bearer newest');
  assert.equal(vm.runInContext('clientCredentials.get("A").revision', worker.context), 5);
});

test('old account-generation SET and CLEAR messages are ignored', async () => {
  const worker = createWorker(() => partialResponse());
  worker.addClient('A');
  worker.setToken('A', 'current-account-token', {
    account: 'current-account', revision: 2, accountGeneration: 4
  });
  worker.setToken('A', 'old-account-token', {
    account: 'old-account', revision: 999, accountGeneration: 3
  });
  worker.clearToken('A', {
    account: 'old-account', revision: 999, accountGeneration: 3
  });

  assert.equal((await worker.request('A', { accountGeneration: 4 }).response).status, 206);
  assert.equal(worker.calls[0].headers.get('Authorization'), 'Bearer current-account-token');
  assert.equal(vm.runInContext('clientCredentials.get("A").account', worker.context), 'current-account');
  assert.equal(vm.runInContext('clientCredentials.get("A").revision', worker.context), 2);
  assert.equal(vm.runInContext('clientCredentials.get("A").accountGeneration', worker.context), 4);
});

test('worker restart resolves only the requesting client and requires the correlated response', async () => {
  const worker = createWorker(() => partialResponse());
  const aMessages = worker.addClient('A', (message, port) => {
    port.postMessage(tokenResponse(message, 'wrong', { requestId: 'wrong' }));
    worker.message('B', tokenResponse(message, 'B-token', { account: accountForClient('B') }));
    worker.message('A', tokenResponse(message, 'A-token'));
  });
  const bMessages = worker.addClient('B');
  await worker.request('A').response;
  assert.equal(worker.calls[0].headers.get('Authorization'), 'Bearer A-token');
  assert.equal(aMessages[0].forceRefresh, false);
  assert.equal(aMessages[0].accountGeneration, 1);
  assert.equal(aMessages[0].expectedAccount, null);
  assert.equal(aMessages[0].rejectedRevision, null);
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

test('media fixtures carry account generation and reject malformed source generations', async () => {
  const validWorker = createWorker(() => partialResponse());
  validWorker.addClient('A');
  validWorker.setToken('A', 'valid');
  const validRequest = validWorker.request('A');
  assert.equal(new URL(validRequest.request.url).searchParams.get('accountGeneration'), '1');
  assert.equal((await validRequest.response).status, 206);

  for (const accountGeneration of [null, 'not-an-integer', -1, 1.5]) {
    const worker = createWorker(() => { throw new Error('must not fetch'); });
    worker.addClient('A');
    worker.setToken('A', 'valid');
    const response = await worker.request('A', { accountGeneration }).response;
    assert.equal(response.status, 400);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.equal(worker.calls.length, 0);
  }
  for (const sourceGeneration of ['not-an-integer', -1, 1.5]) {
    const worker = createWorker(() => { throw new Error('must not fetch'); });
    worker.addClient('A');
    worker.setToken('A', 'valid');
    const response = await worker.request('A', { sourceGeneration }).response;
    assert.equal(response.status, 400);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.equal(worker.calls.length, 0);
  }
});

test('unsafe or malformed media ranges are rejected before credential and Drive access', async () => {
  for (const testCase of [
    { name: 'unsafe range start', range: 'bytes=9007199254740992-', size: '4294967297' },
    { name: 'unsafe inclusive span', range: 'bytes=0-9007199254740991', size: '4294967297' },
    { name: 'empty suffix', range: 'bytes=-0', size: '4294967297' },
    { name: 'empty Range header', range: '', size: '4294967297' },
    { name: 'multiple ranges', range: 'bytes=0-1,3-4', size: '4294967297' },
    { name: 'unsafe declared size', range: 'bytes=0-0', size: '9007199254740992' }
  ]) {
    let tokenRequests = 0;
    const worker = createWorker(() => new Response('must not reach Drive', {
      status: 416,
      headers: { 'Content-Range': 'bytes */4294967297' }
    }));
    const messages = worker.addClient('A', (message, port) => {
      tokenRequests += 1;
      tokenReply(message, port);
    });

    const response = await worker.request('A', {
      range: testCase.range,
      size: testCase.size,
      traceId: `trace-invalid-${testCase.name.replaceAll(' ', '-')}`
    }).response;
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(response.status, 400, testCase.name);
    assert.equal(response.headers.get('Cache-Control'), 'no-store', testCase.name);
    assert.equal(tokenRequests, 0, testCase.name);
    assert.equal(worker.calls.length, 0, testCase.name);
    assert.equal(messages.some((message) => message.type === 'MEDIA_PROXY_STATUS'), false, testCase.name);
    const failures = messages.filter((message) => message.type === 'MEDIA_PROXY_ERROR');
    assert.equal(failures.length, 1, testCase.name);
    assert.equal(failures[0].status, 400, testCase.name);
    assert.equal(failures[0].category, 'range-invalid', testCase.name);
    assert.equal(failures[0].driveReason, 'rangeInvalid', testCase.name);
    assert.equal(failures[0].requestedRange, testCase.range || null, testCase.name);
    assert.equal(failures[0].contentRange, null, testCase.name);
    assert.equal(failures[0].rangeSatisfied, false, testCase.name);
    const trace = messages.filter((message) => message.type === 'MEDIA_TRACE_EVENT');
    assert.deepEqual(trace.map((message) => message.stage), ['range-error'], testCase.name);
    assert.equal(trace[0].status, 400, testCase.name);
    assert.equal(trace[0].reason, 'range-invalid', testCase.name);
    assert.equal(trace[0].terminal, true, testCase.name);
  }
});

test('media requests without Range remain valid and never synthesize an upstream Range header', async () => {
  const worker = createWorker((url, options) => options.method === 'HEAD'
    ? new Response(null, { status: 200 })
    : new Response('whole original', { status: 200 }));
  const messages = worker.addClient('A');
  worker.setToken('A', 'valid');

  const getResponse = await worker.request('A', { range: null, size: null }).response;
  assert.equal(getResponse.status, 200);
  assert.equal(await getResponse.text(), 'whole original');
  const headResponse = await worker.request('A', {
    method: 'HEAD',
    range: null,
    size: '4294967297'
  }).response;
  assert.equal(headResponse.status, 200);
  assert.equal(headResponse.body, null);

  assert.equal(worker.calls.length, 2);
  assert.ok(worker.calls.every((call) => call.headers.get('Range') == null));
  const statuses = messages.filter((message) => message.type === 'MEDIA_PROXY_STATUS');
  assert.equal(statuses.length, 2);
  assert.ok(statuses.every((status) => status.requestedRange == null));
  assert.ok(statuses.every((status) => status.rangeSatisfied === false));
  assert.ok(statuses.every((status) => status.playbackMode === 'original-sequential'));
  assert.equal(messages.some((message) => message.type === 'MEDIA_PROXY_ERROR'), false);
});

test('2 GiB and 4 GiB byte boundaries preserve exact Range arithmetic with tiny bodies', async () => {
  const cases = [
    {
      name: '2 GiB exact byte',
      range: 'bytes=2147483648-2147483648',
      size: '2147483649',
      contentRange: 'bytes 2147483648-2147483648/2147483649',
      bytes: [21],
      hidden: false
    },
    {
      name: '2 GiB crossing interval',
      range: 'bytes=2147483647-2147483649',
      size: '2147483650',
      contentRange: 'bytes 2147483647-2147483649/2147483650',
      bytes: [22, 23, 24],
      hidden: true
    },
    {
      name: '4 GiB exact byte',
      range: 'bytes=4294967296-4294967296',
      size: '4294967297',
      contentRange: 'bytes 4294967296-4294967296/4294967297',
      bytes: [41],
      hidden: false
    },
    {
      name: '4 GiB open range',
      range: 'bytes=4294967296-',
      size: '4294967298',
      contentRange: 'bytes 4294967296-4294967297/4294967298',
      bytes: [42, 43],
      hidden: true
    },
    {
      name: '4 GiB suffix range',
      range: 'bytes=-2',
      size: '4294967297',
      contentRange: 'bytes 4294967295-4294967296/4294967297',
      bytes: [44, 45],
      hidden: true
    },
    {
      name: 'maximum safe final byte',
      range: 'bytes=9007199254740990-9007199254740990',
      size: '9007199254740991',
      contentRange: 'bytes 9007199254740990-9007199254740990/9007199254740991',
      bytes: [90],
      hidden: false
    }
  ];

  for (const testCase of cases) {
    const body = new Uint8Array(testCase.bytes);
    const worker = createWorker(() => new Response(body, {
      status: 206,
      headers: {
        ...(testCase.hidden ? {} : { 'Content-Range': testCase.contentRange }),
        'Content-Length': String(body.byteLength)
      }
    }));
    const messages = worker.addClient('A');
    worker.setToken('A', 'valid');

    const response = await worker.request('A', {
      range: testCase.range,
      size: testCase.size,
      traceId: `trace-boundary-${testCase.name.replaceAll(' ', '-')}`
    }).response;
    assert.equal(response.status, 206, testCase.name);
    assert.equal(response.headers.get('Content-Range'), testCase.contentRange, testCase.name);
    assert.equal(response.headers.get('Accept-Ranges'), 'bytes', testCase.name);
    assert.deepEqual(Array.from(new Uint8Array(await response.arrayBuffer())), testCase.bytes, testCase.name);
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(worker.calls.length, 1, testCase.name);
    assert.equal(worker.calls[0].headers.get('Range'), testCase.range, testCase.name);
    const statuses = messages.filter((message) => message.type === 'MEDIA_PROXY_STATUS');
    assert.equal(statuses.length, 1, testCase.name);
    assert.equal(statuses[0].contentRange, testCase.contentRange, testCase.name);
    assert.equal(statuses[0].contentRangeInferred, testCase.hidden, testCase.name);
    assert.equal(statuses[0].rangeSatisfied, true, testCase.name);
    assert.equal(statuses[0].playbackMode, 'original-range', testCase.name);
    assert.equal(messages.some((message) => message.type === 'MEDIA_PROXY_ERROR'), false, testCase.name);
    const trace = messages.filter((message) => message.type === 'MEDIA_TRACE_EVENT');
    const firstByte = trace.find((message) => message.stage === 'first-byte');
    const completion = trace.find((message) => message.stage === 'body-complete');
    assert.equal(firstByte.bytes, body.byteLength, testCase.name);
    assert.equal(firstByte.totalBytes, body.byteLength, testCase.name);
    assert.equal(completion.bytes, body.byteLength, testCase.name);
    assert.equal(completion.totalBytes, body.byteLength, testCase.name);
  }
});

test('large hidden full-span HEAD ranges are proven without allocating their bodies', async () => {
  for (const size of [
    '2147483647', '2147483648', '2147483649',
    '4294967295', '4294967296', '4294967297'
  ]) {
    const worker = createWorker(() => new Response(null, {
      status: 206,
      headers: { 'Content-Length': size }
    }));
    const messages = worker.addClient('A');
    worker.setToken('A', 'valid');

    const response = await worker.request('A', {
      method: 'HEAD',
      range: 'bytes=0-',
      size
    }).response;

    assert.equal(response.status, 206, size);
    assert.equal(response.body, null, size);
    assert.equal(response.headers.get('Content-Range'), `bytes 0-${Number(size) - 1}/${size}`, size);
    assert.equal(worker.calls[0].headers.get('Range'), 'bytes=0-', size);
    const status = messages.find((message) => message.type === 'MEDIA_PROXY_STATUS');
    assert.equal(status.contentRangeInferred, true, size);
    assert.equal(status.rangeSatisfied, true, size);
    assert.equal(status.playbackMode, 'original-range', size);
    assert.equal(messages.some((message) => message.type === 'MEDIA_PROXY_ERROR'), false, size);
  }
});

test('a hidden 4 GiB GET streams a tiny prefix and classifies truncated EOF without whole-file allocation', async () => {
  const worker = createWorker(() => new Response(new Uint8Array([47]), {
    status: 206,
    headers: { 'Content-Length': '4294967297' }
  }));
  const messages = worker.addClient('A');
  worker.setToken('A', 'valid');

  const response = await worker.request('A', {
    range: 'bytes=0-',
    size: '4294967297',
    traceId: 'trace-large-truncated-body'
  }).response;

  assert.equal(response.status, 206);
  assert.equal(response.headers.get('Content-Range'), 'bytes 0-4294967296/4294967297');
  await assert.rejects(response.arrayBuffer(), { name: 'MediaBodyLengthError' });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(worker.calls.length, 1);
  const statuses = messages.filter((message) => message.type === 'MEDIA_PROXY_STATUS');
  assert.equal(statuses.length, 1);
  assert.equal(statuses[0].rangeSatisfied, true);
  const failures = messages.filter((message) => message.type === 'MEDIA_PROXY_ERROR');
  assert.equal(failures.length, 1);
  assert.equal(failures[0].category, 'network');
  assert.equal(failures[0].driveReason, 'bodyLengthMismatch');
  assert.equal(failures[0].rangeSatisfied, false);
  const trace = messages.filter((message) => message.type === 'MEDIA_TRACE_EVENT');
  const firstByte = trace.find((message) => message.stage === 'first-byte');
  assert.equal(firstByte.bytes, 1);
  assert.equal(firstByte.totalBytes, 4294967297);
  const bodyError = trace.find((message) => message.stage === 'body-error');
  assert.equal(bodyError.bytes, 1);
  assert.equal(bodyError.totalBytes, 4294967297);
  assert.equal(bodyError.reason, 'body-length-mismatch');
  assert.equal(bodyError.terminal, true);
});

test('a 4 GiB EOF request preserves one structured 416 without a success status', async () => {
  const worker = createWorker(() => new Response(null, {
    status: 416,
    headers: { 'Content-Range': 'bytes */4294967297' }
  }));
  const messages = worker.addClient('A');
  worker.setToken('A', 'valid');

  const response = await worker.request('A', {
    method: 'HEAD',
    range: 'bytes=4294967297-',
    size: '4294967297'
  }).response;

  assert.equal(response.status, 416);
  assert.equal(response.body, null);
  assert.equal(response.headers.get('Content-Range'), 'bytes */4294967297');
  assert.equal(worker.calls.length, 1);
  assert.equal(worker.calls[0].headers.get('Range'), 'bytes=4294967297-');
  assert.equal(messages.some((message) => message.type === 'MEDIA_PROXY_STATUS'), false);
  const failures = messages.filter((message) => message.type === 'MEDIA_PROXY_ERROR');
  assert.equal(failures.length, 1);
  assert.equal(failures[0].status, 416);
  assert.equal(failures[0].category, 'range-unsatisfiable');
  assert.equal(failures[0].driveReason, 'rangeNotSatisfiable');
  assert.equal(failures[0].requestedRange, 'bytes=4294967297-');
  assert.equal(failures[0].contentRange, 'bytes */4294967297');
  assert.equal(failures[0].rangeSatisfied, false);
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
    requestId: 'media-1',
    fileId: 'fileA',
    sessionId: '7',
    mediaSession: '7',
    status: 200,
    requestedRange: 'bytes=100-199',
    contentRange: null,
    contentRangeInferred: false,
    rangeSatisfied: false,
    playbackMode: 'original-sequential'
  });
});

test('a CORS-hidden Content-Range is reconstructed from known size and matching Content-Length', async () => {
  const worker = createWorker(() => new Response('x'.repeat(100), {
    status: 206,
    headers: { 'Content-Length': '100' }
  }));
  const messages = worker.addClient('A');
  worker.setToken('A', 'valid');
  const response = await worker.request('A').response;
  assert.equal(response.status, 206);
  assert.equal(response.headers.get('Content-Range'), 'bytes 100-199/1000');
  assert.equal(response.headers.get('Accept-Ranges'), 'bytes');
  assert.equal(await response.text(), 'x'.repeat(100));
  const status = messages.find((message) => message.type === 'MEDIA_PROXY_STATUS');
  assert.equal(status.contentRange, 'bytes 100-199/1000');
  assert.equal(status.contentRangeInferred, true);
  assert.equal(status.rangeSatisfied, true);
  assert.equal(status.playbackMode, 'original-range');
});

test('hidden Content-Range reconstruction supports open-ended and suffix ranges', async () => {
  for (const [range, length, expected] of [
    ['bytes=0-', 1000, 'bytes 0-999/1000'],
    ['bytes=-100', 100, 'bytes 900-999/1000']
  ]) {
    const worker = createWorker(() => new Response('x'.repeat(length), {
      status: 206,
      headers: { 'Content-Length': String(length) }
    }));
    const messages = worker.addClient('A');
    worker.setToken('A', 'valid');
    const response = await worker.request('A', { range }).response;
    assert.equal(response.status, 206);
    assert.equal(response.headers.get('Content-Range'), expected);
    assert.equal(messages.find((message) => message.type === 'MEDIA_PROXY_STATUS').contentRangeInferred, true);
  }
});

test('hidden range reconstruction handles file edges and rejects unsafe numeric evidence', () => {
  const worker = createWorker(() => new Response('unused'));
  const infer = (range, size, length) => vm.runInContext(
    `inferContentRangeFromLength(${JSON.stringify(range)}, ${JSON.stringify(size)}, ${JSON.stringify(length)})`,
    worker.context
  );
  assert.equal(infer('bytes=950-1050', '1000', '50'), 'bytes 950-999/1000');
  assert.equal(infer('bytes=-2000', '1000', '1000'), 'bytes 0-999/1000');
  assert.equal(infer('bytes=1000-', '1000', '1'), null);
  assert.equal(infer('bytes=-0', '1000', '1'), null);
  assert.equal(infer('bytes=0-', '9007199254740992', '1000'), null);
  assert.equal(infer('bytes=0-', '1000', '1e3'), null);
});

test('a hidden valid 206 HEAD range is reconstructed without adding a body', async () => {
  const worker = createWorker(() => new Response(null, {
    status: 206,
    headers: { 'Content-Length': '100' }
  }));
  const messages = worker.addClient('A');
  worker.setToken('A', 'valid');
  const response = await worker.request('A', { method: 'HEAD' }).response;
  assert.equal(response.status, 206);
  assert.equal(response.headers.get('Content-Range'), 'bytes 100-199/1000');
  assert.equal(await response.text(), '');
  assert.equal(messages.find((message) => message.type === 'MEDIA_PROXY_STATUS').contentRangeInferred, true);
});

test('a visible mismatched or unprovable hidden Content-Range on 206 fails closed', async () => {
  const cases = [
    {
      response: () => partialResponse('x'.repeat(100), 'bytes 200-299/1000', { 'Content-Length': '100' }),
      expectedContentRange: 'bytes 200-299/1000'
    },
    {
      response: () => new Response('unproven bytes', { status: 206 }),
      expectedContentRange: null
    },
    {
      response: () => new Response('x'.repeat(100), { status: 206, headers: { 'Content-Length': '100' } }),
      size: null,
      expectedContentRange: null
    },
    {
      response: () => new Response('x'.repeat(101), { status: 206, headers: { 'Content-Length': '101' } }),
      expectedContentRange: null
    },
    {
      response: () => new Response('x'.repeat(99), { status: 206, headers: { 'Content-Length': '99' } }),
      expectedContentRange: null
    },
    {
      response: () => new Response('', {
        status: 206,
        headers: { 'Content-Range': 'bytes 0-9007199254740991/*' }
      }),
      range: 'bytes=0-',
      size: null,
      expectedContentRange: 'bytes 0-9007199254740991/*'
    }
  ];
  for (const testCase of cases) {
    const worker = createWorker(testCase.response);
    const messages = worker.addClient('A');
    worker.setToken('A', 'valid');
    const response = await worker.request('A', { range: testCase.range, size: testCase.size }).response;
    assert.equal(response.status, 502);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.equal(messages.some((message) => message.type === 'MEDIA_PROXY_STATUS'), false);
    const failure = messages.find((message) => message.type === 'MEDIA_PROXY_ERROR');
    assert.equal(failure.status, 206);
    assert.equal(failure.category, 'range-invalid');
    assert.equal(failure.driveReason, 'rangeInvalid');
    assert.equal(failure.requestedRange, testCase.range || 'bytes=100-199');
    assert.equal(failure.contentRange, testCase.expectedContentRange);
    assert.equal(failure.contentRangeInferred, false);
    assert.equal(failure.rangeSatisfied, false);
    assert.equal(failure.sessionId, '7');
  }
});

test('open-ended and suffix byte ranges accept valid contained 206 responses', async () => {
  for (const [range, contentRange] of [
    ['bytes=0-', 'bytes 0-499/1000'],
    ['bytes=-100', 'bytes 900-999/1000']
  ]) {
    const parsed = /bytes (\d+)-(\d+)\//.exec(contentRange);
    const body = 'x'.repeat(Number(parsed[2]) - Number(parsed[1]) + 1);
    const worker = createWorker(() => partialResponse(body, contentRange));
    const messages = worker.addClient('A');
    worker.setToken('A', 'valid');
    assert.equal((await worker.request('A', { range, size: null }).response).status, 206);
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
  for (const response of [
    { token: null, revision: 2 },
    { token: 'old', revision: 1 }
  ]) {
    const worker = createWorker(() => errorResponse(401));
    const messages = worker.addClient('A', (message, port) => {
      tokenReply(message, port, response.token, { revision: response.revision });
    });
    worker.setToken('A', 'old');
    assert.equal((await worker.request('A').response).status, 401);
    assert.equal(worker.calls.length, 1);
    assert.equal(messages.filter((message) => message.type === 'MEDIA_PROXY_ERROR').length, 1);
  }
});

test('a rejected token is replayed once when the same token arrives at a higher revision', async () => {
  const worker = createWorker((url, options, attempt) => attempt === 1
    ? errorResponse(401)
    : partialResponse('revision-fenced bytes'));
  const messages = worker.addClient('A', (message, port) => {
    tokenReply(message, port, 'stable-token', { revision: 8 });
  });
  worker.setToken('A', 'stable-token', { revision: 7 });

  const response = await worker.request('A').response;

  assert.equal(response.status, 206);
  assert.equal(await response.text(), 'revision-fenced bytes');
  assert.equal(worker.calls.length, 2);
  assert.deepEqual(
    worker.calls.map((call) => call.headers.get('Authorization')),
    ['Bearer stable-token', 'Bearer stable-token']
  );
  const refresh = messages.find((message) => message.type === 'TOKEN_REQUEST');
  assert.equal(refresh.forceRefresh, true);
  assert.equal(refresh.expectedAccount, accountForClient('A'));
  assert.equal(refresh.rejectedRevision, 7);
  assert.equal(vm.runInContext('clientCredentials.get("A").revision', worker.context), 8);
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

test('upstream headers timeout is finite and distinct from caller cancellation', async () => {
  const scheduled = new Map();
  let timerSequence = 0;
  let upstreamStarted;
  const started = new Promise((resolve) => { upstreamStarted = resolve; });
  const worker = createWorker((url, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    upstreamStarted();
  }), {
    setTimeoutImpl(callback, delay) {
      const timerId = ++timerSequence;
      scheduled.set(timerId, { callback, delay });
      return timerId;
    },
    clearTimeoutImpl(timerId) {
      scheduled.delete(timerId);
    }
  });
  const messages = worker.addClient('A');
  worker.setToken('A', 'valid');
  const { request, response } = worker.request('A', { traceId: 'trace-headers-timeout' });
  await started;

  assert.equal(scheduled.size, 1);
  const [headersTimer] = [...scheduled.values()];
  assert.equal(headersTimer.delay, 10_000);
  headersTimer.callback();

  const result = await response;
  assert.equal(result.status, 504);
  assert.equal(result.headers.get('Cache-Control'), 'no-store');
  assert.equal(worker.calls.length, 1);
  assert.notEqual(worker.calls[0].signal, request.signal);
  assert.equal(worker.calls[0].signal.aborted, true);
  assert.equal(request.signal.aborted, false);
  assert.equal(scheduled.size, 0);
  const failures = messages.filter((message) => message.type === 'MEDIA_PROXY_ERROR');
  assert.equal(failures.length, 1);
  assert.equal(failures[0].status, 504);
  assert.equal(failures[0].category, 'timeout');
  assert.equal(failures[0].driveReason, 'headersTimeout');
  await new Promise((resolve) => setImmediate(resolve));
  const trace = messages.filter((message) => message.type === 'MEDIA_TRACE_EVENT');
  assert.deepEqual(trace.map((message) => message.stage), [
    'credential-requested', 'credential-ready', 'request-start', 'http-error'
  ]);
  assert.equal(trace.at(-1).reason, 'headers-timeout');
  assert.equal(trace.at(-1).status, 504);
  assert.equal(trace.some((message) => message.stage === 'request-cancelled'), false);
});

test('first-byte timeout starts on downstream demand and reports one classified failure', async () => {
  const scheduled = new Map();
  let timerSequence = 0;
  const worker = createWorker((url, { signal }) => new Response(new ReadableStream({
    start(controller) {
      signal.addEventListener('abort', () => controller.error(signal.reason), { once: true });
    }
  }), {
    status: 206,
    headers: { 'Content-Range': 'bytes 100-199/1000', 'Content-Length': '100' }
  }), {
    setTimeoutImpl(callback, delay) {
      const timerId = ++timerSequence;
      scheduled.set(timerId, { callback, delay });
      return timerId;
    },
    clearTimeoutImpl(timerId) {
      scheduled.delete(timerId);
    }
  });
  const messages = worker.addClient('A');
  worker.setToken('A', 'valid');
  const { request, response } = worker.request('A', { traceId: 'trace-first-byte-timeout' });
  const result = await response;

  assert.equal(scheduled.size, 0, 'headers alone must not arm a body deadline');
  const reader = result.body.getReader();
  const pendingRead = reader.read();
  await Promise.resolve();
  assert.equal(scheduled.size, 1);
  const [firstByteTimer] = [...scheduled.values()];
  assert.equal(firstByteTimer.delay, 15_000);
  firstByteTimer.callback();

  await assert.rejects(pendingRead, { name: 'MediaFirstByteTimeoutError' });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(worker.calls[0].signal.aborted, true);
  assert.equal(request.signal.aborted, false);
  assert.equal(scheduled.size, 0);
  const failures = messages.filter((message) => message.type === 'MEDIA_PROXY_ERROR');
  assert.equal(failures.length, 1);
  assert.equal(failures[0].status, 504);
  assert.equal(failures[0].category, 'timeout');
  assert.equal(failures[0].driveReason, 'firstByteTimeout');
  const trace = messages.filter((message) => message.type === 'MEDIA_TRACE_EVENT');
  assert.equal(trace.at(-1).stage, 'first-byte-timeout');
  assert.equal(trace.at(-1).reason, 'first-byte-timeout');
  assert.equal(trace.at(-1).terminal, true);
  assert.equal(trace.filter((message) => message.stage === 'first-byte-timeout').length, 1);
  assert.equal(trace.some((message) => ['body-error', 'request-cancelled'].includes(message.stage)), false);
});

test('first-byte stream failure waits for the classified client notification lifetime', async () => {
  const scheduled = new Map();
  let timerSequence = 0;
  const worker = createWorker((url, { signal }) => new Response(new ReadableStream({
    start(controller) {
      signal.addEventListener('abort', () => controller.error(signal.reason), { once: true });
    }
  }), {
    status: 206,
    headers: { 'Content-Range': 'bytes 100-199/1000', 'Content-Length': '100' }
  }), {
    setTimeoutImpl(callback, delay) {
      const timerId = ++timerSequence;
      scheduled.set(timerId, { callback, delay });
      return timerId;
    },
    clearTimeoutImpl(timerId) {
      scheduled.delete(timerId);
    }
  });
  const messages = worker.addClient('A');
  worker.setToken('A', 'valid');
  const response = await worker.request('A').response;
  const client = await worker.context.self.clients.get('A');
  let releaseClientLookup;
  worker.context.self.clients.get = async () => new Promise((resolve) => {
    releaseClientLookup = () => resolve(client);
  });
  const pendingRead = response.body.getReader().read();
  let readSettled = false;
  void pendingRead.then(
    () => { readSettled = true; },
    () => { readSettled = true; }
  );
  await Promise.resolve();
  [...scheduled.values()][0].callback();
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(readSettled, false);
  assert.equal(messages.some((message) => message.type === 'MEDIA_PROXY_ERROR'), false);
  releaseClientLookup();
  await assert.rejects(pendingRead, { name: 'MediaFirstByteTimeoutError' });
  assert.equal(messages.filter((message) => message.type === 'MEDIA_PROXY_ERROR').length, 1);
});

test('first-byte timeout atomically wins over later bytes, caller abort and consumer cancel', async () => {
  for (const lateEvent of ['byte', 'caller-abort', 'consumer-cancel']) {
    const scheduled = new Map();
    let timerSequence = 0;
    let sourceController;
    const worker = createWorker(() => new Response(new ReadableStream({
      start(controller) { sourceController = controller; }
    }), {
      status: 206,
      headers: { 'Content-Range': 'bytes 100-199/1000', 'Content-Length': '100' }
    }), {
      setTimeoutImpl(callback, delay) {
        const timerId = ++timerSequence;
        scheduled.set(timerId, { callback, delay });
        return timerId;
      },
      clearTimeoutImpl(timerId) {
        scheduled.delete(timerId);
      }
    });
    const messages = worker.addClient('A');
    worker.setToken('A', 'valid');
    const caller = new AbortController();
    const response = await worker.request('A', {
      signal: caller.signal,
      traceId: `trace-timeout-race-${lateEvent}`
    }).response;
    const reader = response.body.getReader();
    const pendingRead = reader.read();
    await Promise.resolve();
    [...scheduled.values()][0].callback();

    if (lateEvent === 'caller-abort') caller.abort();
    if (lateEvent === 'consumer-cancel') {
      await reader.cancel('late consumer cancel');
      assert.equal((await pendingRead).done, true);
    } else {
      sourceController.enqueue(new Uint8Array([9]));
      await assert.rejects(pendingRead, { name: 'MediaFirstByteTimeoutError' });
    }
    await new Promise((resolve) => setImmediate(resolve));
    const failures = messages.filter((message) => message.type === 'MEDIA_PROXY_ERROR');
    const trace = messages.filter((message) => message.type === 'MEDIA_TRACE_EVENT');
    assert.equal(failures.length, 1, lateEvent);
    assert.equal(failures[0].driveReason, 'firstByteTimeout', lateEvent);
    assert.equal(trace.filter((message) => message.stage === 'first-byte-timeout').length, 1, lateEvent);
    assert.equal(trace.some((message) => ['first-byte', 'body-error', 'request-cancelled'].includes(message.stage)), false, lateEvent);
  }
});

test('first-byte protection remains active when diagnostic tracing is off', async () => {
  const scheduled = new Map();
  let timerSequence = 0;
  const worker = createWorker((url, { signal }) => new Response(new ReadableStream({
    start(controller) {
      signal.addEventListener('abort', () => controller.error(signal.reason), { once: true });
    }
  }), {
    status: 206,
    headers: { 'Content-Range': 'bytes 100-199/1000', 'Content-Length': '100' }
  }), {
    setTimeoutImpl(callback, delay) {
      const timerId = ++timerSequence;
      scheduled.set(timerId, { callback, delay });
      return timerId;
    },
    clearTimeoutImpl(timerId) {
      scheduled.delete(timerId);
    }
  });
  const messages = worker.addClient('A');
  worker.setToken('A', 'valid');
  const response = await worker.request('A').response;
  const pendingRead = response.body.getReader().read();
  await Promise.resolve();
  assert.equal([...scheduled.values()][0]?.delay, 15_000);
  [...scheduled.values()][0].callback();

  await assert.rejects(pendingRead, { name: 'MediaFirstByteTimeoutError' });
  await new Promise((resolve) => setImmediate(resolve));
  const failures = messages.filter((message) => message.type === 'MEDIA_PROXY_ERROR');
  assert.equal(failures.length, 1);
  assert.equal(failures[0].driveReason, 'firstByteTimeout');
  assert.equal(messages.some((message) => message.type === 'MEDIA_TRACE_EVENT'), false);
});

test('a positive first chunk clears the first-byte deadline without aborting upstream', async () => {
  const scheduled = new Map();
  let timerSequence = 0;
  let sourceController;
  const worker = createWorker(() => new Response(new ReadableStream({
    start(controller) { sourceController = controller; }
  }), {
    status: 206,
    headers: { 'Content-Range': 'bytes 100-199/1000', 'Content-Length': '100' }
  }), {
    setTimeoutImpl(callback, delay) {
      const timerId = ++timerSequence;
      scheduled.set(timerId, { callback, delay });
      return timerId;
    },
    clearTimeoutImpl(timerId) {
      scheduled.delete(timerId);
    }
  });
  const messages = worker.addClient('A');
  worker.setToken('A', 'valid');
  const response = await worker.request('A', {
    traceId: 'trace-first-byte-ok', sourceGeneration: 9
  }).response;
  assert.equal(scheduled.size, 0);
  const reader = response.body.getReader();
  const pendingRead = reader.read();
  await Promise.resolve();
  assert.equal([...scheduled.values()][0]?.delay, 15_000);

  sourceController.enqueue(new Uint8Array([1, 2, 3]));
  const first = await pendingRead;
  assert.equal(first.value.byteLength, 3);
  assert.equal(scheduled.size, 0);
  assert.equal(worker.calls[0].signal.aborted, false);
  await reader.cancel('test complete');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(messages.some((message) => message.type === 'MEDIA_PROXY_ERROR'), false);
  const progress = messages.find((message) => message.type === 'MEDIA_PROXY_PROGRESS');
  assert.deepEqual({ ...progress }, {
    type: 'MEDIA_PROXY_PROGRESS',
    requestId: 'media-1',
    fileId: 'fileA',
    sessionId: '7',
    mediaSession: '7',
    sourceGeneration: 9,
    stage: 'first-byte',
    status: 206,
    requestedRange: 'bytes=100-199',
    rangeSatisfied: true,
    playbackMode: 'original-range',
    bytes: 3,
    totalBytes: 100
  });
  const trace = messages.filter((message) => message.type === 'MEDIA_TRACE_EVENT');
  assert.equal(trace.filter((message) => message.stage === 'first-byte').length, 1);
  assert.equal(trace.some((message) => message.stage === 'first-byte-timeout'), false);
});

test('body no-progress timeout exists only while downstream is waiting after the first byte', async () => {
  const scheduled = new Map();
  let timerSequence = 0;
  let sourceController;
  const worker = createWorker((url, { signal }) => new Response(new ReadableStream({
    start(controller) {
      sourceController = controller;
      signal.addEventListener('abort', () => controller.error(signal.reason), { once: true });
    }
  }), {
    status: 206,
    headers: { 'Content-Range': 'bytes 100-199/1000', 'Content-Length': '100' }
  }), {
    setTimeoutImpl(callback, delay) {
      const timerId = ++timerSequence;
      scheduled.set(timerId, { callback, delay });
      return timerId;
    },
    clearTimeoutImpl(timerId) {
      scheduled.delete(timerId);
    }
  });
  const messages = worker.addClient('A');
  worker.setToken('A', 'valid');
  const { request, response } = worker.request('A', { traceId: 'trace-body-no-progress' });
  const result = await response;
  const reader = result.body.getReader();

  const firstRead = reader.read();
  await Promise.resolve();
  assert.equal([...scheduled.values()][0]?.delay, 15_000);
  sourceController.enqueue(new Uint8Array([1, 2, 3]));
  assert.equal((await firstRead).value.byteLength, 3);
  assert.equal(scheduled.size, 0);
  await Promise.resolve();
  assert.equal(scheduled.size, 0, 'no downstream pull means normal pause, not a body stall');

  const stalledRead = reader.read();
  await Promise.resolve();
  assert.equal(scheduled.size, 1);
  const [bodyTimer] = [...scheduled.values()];
  assert.equal(bodyTimer.delay, 15_000);
  bodyTimer.callback();

  await assert.rejects(stalledRead, { name: 'MediaBodyNoProgressError' });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(worker.calls[0].signal.aborted, true);
  assert.equal(request.signal.aborted, false);
  assert.equal(scheduled.size, 0);
  const failures = messages.filter((message) => message.type === 'MEDIA_PROXY_ERROR');
  assert.equal(failures.length, 1);
  assert.equal(failures[0].status, 504);
  assert.equal(failures[0].category, 'timeout');
  assert.equal(failures[0].driveReason, 'bodyNoProgress');
  const trace = messages.filter((message) => message.type === 'MEDIA_TRACE_EVENT');
  assert.equal(trace.filter((message) => message.stage === 'first-byte').length, 1);
  assert.equal(trace.filter((message) => message.stage === 'body-no-progress').length, 1);
  assert.equal(trace.at(-1).reason, 'body-no-progress');
  assert.equal(trace.some((message) => ['body-error', 'request-cancelled'].includes(message.stage)), false);
});

test('positive body chunks clear and renew the no-progress deadline while empty chunks do not', async () => {
  const scheduled = new Map();
  let timerSequence = 0;
  let sourceController;
  const worker = createWorker(() => new Response(new ReadableStream({
    start(controller) { sourceController = controller; }
  }), {
    status: 206,
    headers: { 'Content-Range': 'bytes 100-199/1000', 'Content-Length': '100' }
  }), {
    setTimeoutImpl(callback, delay) {
      const timerId = ++timerSequence;
      scheduled.set(timerId, { callback, delay });
      return timerId;
    },
    clearTimeoutImpl(timerId) {
      scheduled.delete(timerId);
    }
  });
  const messages = worker.addClient('A');
  worker.setToken('A', 'valid');
  const response = await worker.request('A', { traceId: 'trace-body-progress-renewal' }).response;
  const reader = response.body.getReader();

  const firstRead = reader.read();
  await Promise.resolve();
  sourceController.enqueue(new Uint8Array([1]));
  await firstRead;
  assert.equal(scheduled.size, 0);

  const secondRead = reader.read();
  await Promise.resolve();
  await Promise.resolve();
  const [secondTimerId, secondTimer] = [...scheduled.entries()][0];
  assert.equal(secondTimer.delay, 15_000);
  sourceController.enqueue(new Uint8Array(0));
  await Promise.resolve();
  assert.equal(scheduled.has(secondTimerId), true, 'an empty chunk cannot refresh the body clock');
  sourceController.enqueue(new Uint8Array([2, 3]));
  assert.equal((await secondRead).value.byteLength, 2);
  assert.equal(scheduled.size, 0);

  const thirdRead = reader.read();
  await Promise.resolve();
  await Promise.resolve();
  const [thirdTimerId, thirdTimer] = [...scheduled.entries()][0];
  assert.equal(thirdTimer.delay, 15_000);
  assert.notEqual(thirdTimerId, secondTimerId);
  sourceController.enqueue(new Uint8Array([4]));
  assert.equal((await thirdRead).value.byteLength, 1);
  assert.equal(scheduled.size, 0);
  await reader.cancel('fixture complete');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(messages.some((message) => message.type === 'MEDIA_PROXY_ERROR'), false);
  const trace = messages.filter((message) => message.type === 'MEDIA_TRACE_EVENT');
  assert.equal(trace.filter((message) => message.stage === 'first-byte').length, 1);
  assert.equal(trace.some((message) => message.stage === 'body-no-progress'), false);
});

test('body no-progress timeout atomically wins over later bytes, caller abort and consumer cancel', async () => {
  for (const lateEvent of ['byte', 'caller-abort', 'consumer-cancel']) {
    const scheduled = new Map();
    let timerSequence = 0;
    let sourceController;
    const worker = createWorker(() => new Response(new ReadableStream({
      start(controller) { sourceController = controller; }
    }), {
      status: 206,
      headers: { 'Content-Range': 'bytes 100-199/1000', 'Content-Length': '100' }
    }), {
      setTimeoutImpl(callback, delay) {
        const timerId = ++timerSequence;
        scheduled.set(timerId, { callback, delay });
        return timerId;
      },
      clearTimeoutImpl(timerId) {
        scheduled.delete(timerId);
      }
    });
    const messages = worker.addClient('A');
    worker.setToken('A', 'valid');
    const caller = new AbortController();
    const response = await worker.request('A', {
      signal: caller.signal,
      traceId: `trace-body-timeout-race-${lateEvent}`
    }).response;
    const reader = response.body.getReader();
    const firstRead = reader.read();
    await Promise.resolve();
    sourceController.enqueue(new Uint8Array([1]));
    await firstRead;

    const pendingRead = reader.read();
    await Promise.resolve();
    await Promise.resolve();
    const [bodyTimer] = [...scheduled.values()];
    assert.equal(bodyTimer.delay, 15_000, lateEvent);
    bodyTimer.callback();

    if (lateEvent === 'caller-abort') caller.abort();
    if (lateEvent === 'consumer-cancel') {
      await reader.cancel('late consumer cancel');
      assert.equal((await pendingRead).done, true);
    } else {
      sourceController.enqueue(new Uint8Array([9]));
      await assert.rejects(pendingRead, { name: 'MediaBodyNoProgressError' });
    }
    await new Promise((resolve) => setImmediate(resolve));
    const failures = messages.filter((message) => message.type === 'MEDIA_PROXY_ERROR');
    const trace = messages.filter((message) => message.type === 'MEDIA_TRACE_EVENT');
    assert.equal(failures.length, 1, lateEvent);
    assert.equal(failures[0].driveReason, 'bodyNoProgress', lateEvent);
    assert.equal(trace.filter((message) => message.stage === 'body-no-progress').length, 1, lateEvent);
    assert.equal(trace.some((message) => ['body-error', 'request-cancelled'].includes(message.stage)), false, lateEvent);
  }
});

test('body no-progress failure waits for the classified client notification lifetime', async () => {
  const scheduled = new Map();
  let timerSequence = 0;
  let sourceController;
  const worker = createWorker((url, { signal }) => new Response(new ReadableStream({
    start(controller) {
      sourceController = controller;
      signal.addEventListener('abort', () => controller.error(signal.reason), { once: true });
    }
  }), {
    status: 206,
    headers: { 'Content-Range': 'bytes 100-199/1000', 'Content-Length': '100' }
  }), {
    setTimeoutImpl(callback, delay) {
      const timerId = ++timerSequence;
      scheduled.set(timerId, { callback, delay });
      return timerId;
    },
    clearTimeoutImpl(timerId) {
      scheduled.delete(timerId);
    }
  });
  const messages = worker.addClient('A');
  worker.setToken('A', 'valid');
  const response = await worker.request('A').response;
  const reader = response.body.getReader();
  const firstRead = reader.read();
  await Promise.resolve();
  sourceController.enqueue(new Uint8Array([1]));
  await firstRead;
  await new Promise((resolve) => setImmediate(resolve));

  const client = await worker.context.self.clients.get('A');
  let releaseClientLookup;
  worker.context.self.clients.get = async () => new Promise((resolve) => {
    releaseClientLookup = () => resolve(client);
  });
  const pendingRead = reader.read();
  let readSettled = false;
  void pendingRead.then(
    () => { readSettled = true; },
    () => { readSettled = true; }
  );
  await Promise.resolve();
  await Promise.resolve();
  [...scheduled.values()][0].callback();
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(readSettled, false);
  assert.equal(messages.some((message) => message.type === 'MEDIA_PROXY_ERROR'), false);
  releaseClientLookup();
  await assert.rejects(pendingRead, { name: 'MediaBodyNoProgressError' });
  const failures = messages.filter((message) => message.type === 'MEDIA_PROXY_ERROR');
  assert.equal(failures.length, 1);
  assert.equal(failures[0].driveReason, 'bodyNoProgress');
});

test('body no-progress protection remains active when diagnostic tracing is off', async () => {
  const scheduled = new Map();
  let timerSequence = 0;
  let sourceController;
  const worker = createWorker((url, { signal }) => new Response(new ReadableStream({
    start(controller) {
      sourceController = controller;
      signal.addEventListener('abort', () => controller.error(signal.reason), { once: true });
    }
  }), {
    status: 206,
    headers: { 'Content-Range': 'bytes 100-199/1000', 'Content-Length': '100' }
  }), {
    setTimeoutImpl(callback, delay) {
      const timerId = ++timerSequence;
      scheduled.set(timerId, { callback, delay });
      return timerId;
    },
    clearTimeoutImpl(timerId) {
      scheduled.delete(timerId);
    }
  });
  const messages = worker.addClient('A');
  worker.setToken('A', 'valid');
  const response = await worker.request('A').response;
  const reader = response.body.getReader();
  const firstRead = reader.read();
  await Promise.resolve();
  sourceController.enqueue(new Uint8Array([1]));
  await firstRead;
  const pendingRead = reader.read();
  await Promise.resolve();
  await Promise.resolve();
  [...scheduled.values()][0].callback();

  await assert.rejects(pendingRead, { name: 'MediaBodyNoProgressError' });
  await new Promise((resolve) => setImmediate(resolve));
  const failures = messages.filter((message) => message.type === 'MEDIA_PROXY_ERROR');
  assert.equal(failures.length, 1);
  assert.equal(failures[0].driveReason, 'bodyNoProgress');
  const progress = messages.filter((message) => message.type === 'MEDIA_PROXY_PROGRESS');
  assert.equal(progress.length, 1);
  assert.equal(progress[0].stage, 'first-byte');
  assert.equal(progress[0].bytes, 1);
  assert.equal(messages.some((message) => message.type === 'MEDIA_TRACE_EVENT'), false);
});

test('body terminal outcomes beat a captured stale no-progress callback', async () => {
  for (const ending of ['caller-abort', 'consumer-cancel', 'exact-eof', 'short-eof', 'read-error', 'overrun']) {
    const scheduled = new Map();
    let timerSequence = 0;
    let sourceController;
    const expectedBytes = ['exact-eof'].includes(ending) ? 1 : 2;
    const rangeEnd = 100 + expectedBytes - 1;
    const worker = createWorker((url, { signal }) => new Response(new ReadableStream({
      start(controller) {
        sourceController = controller;
        if (ending === 'caller-abort') {
          signal.addEventListener('abort', () => controller.error(signal.reason), { once: true });
        }
      }
    }), {
      status: 206,
      headers: {
        'Content-Range': `bytes 100-${rangeEnd}/1000`,
        'Content-Length': String(expectedBytes)
      }
    }), {
      setTimeoutImpl(callback, delay) {
        const timerId = ++timerSequence;
        scheduled.set(timerId, { callback, delay });
        return timerId;
      },
      clearTimeoutImpl(timerId) {
        scheduled.delete(timerId);
      }
    });
    const messages = worker.addClient('A');
    worker.setToken('A', 'valid');
    const caller = new AbortController();
    const response = await worker.request('A', {
      range: `bytes=100-${rangeEnd}`,
      signal: caller.signal,
      traceId: `trace-body-terminal-${ending}`
    }).response;
    const reader = response.body.getReader();
    const firstRead = reader.read();
    await Promise.resolve();
    sourceController.enqueue(new Uint8Array([1]));
    await firstRead;
    const pendingRead = reader.read();
    await Promise.resolve();
    await Promise.resolve();
    const staleTimer = [...scheduled.values()][0];
    assert.equal(staleTimer.delay, 15_000, ending);

    let expectedStage;
    if (ending === 'caller-abort') {
      caller.abort(new Error('caller ended body wait'));
      await assert.rejects(pendingRead, /caller ended body wait/);
      expectedStage = 'request-cancelled';
    } else if (ending === 'consumer-cancel') {
      await reader.cancel('consumer ended body wait');
      assert.equal((await pendingRead).done, true);
      expectedStage = 'request-cancelled';
    } else if (ending === 'exact-eof') {
      sourceController.close();
      assert.equal((await pendingRead).done, true);
      expectedStage = 'body-complete';
    } else if (ending === 'short-eof') {
      sourceController.close();
      await assert.rejects(pendingRead, { name: 'MediaBodyLengthError' });
      expectedStage = 'body-error';
    } else if (ending === 'read-error') {
      sourceController.error(new Error('upstream body failed'));
      await assert.rejects(pendingRead, /upstream body failed/);
      expectedStage = 'body-error';
    } else {
      sourceController.enqueue(new Uint8Array([2, 3]));
      await assert.rejects(pendingRead, { name: 'MediaBodyLengthError' });
      expectedStage = 'body-error';
    }

    staleTimer.callback();
    await new Promise((resolve) => setImmediate(resolve));
    const failures = messages.filter((message) => message.type === 'MEDIA_PROXY_ERROR');
    const trace = messages.filter((message) => message.type === 'MEDIA_TRACE_EVENT');
    assert.equal(trace.filter((message) => message.stage === 'body-no-progress').length, 0, ending);
    assert.equal(failures.filter((message) => message.driveReason === 'bodyNoProgress').length, 0, ending);
    assert.equal(trace.at(-1).stage, expectedStage, ending);
    if (ending === 'short-eof' || ending === 'overrun') {
      assert.equal(failures.length, 1, ending);
      assert.equal(failures[0].driveReason, 'bodyLengthMismatch', ending);
    } else {
      assert.equal(failures.length, 0, ending);
    }
  }
});

test('an empty chunk is not a first byte and cannot disarm the deadline', async () => {
  const scheduled = new Map();
  let timerSequence = 0;
  let sourceController;
  const worker = createWorker((url, { signal }) => new Response(new ReadableStream({
    start(controller) {
      sourceController = controller;
      signal.addEventListener('abort', () => controller.error(signal.reason), { once: true });
    }
  }), {
    status: 206,
    headers: { 'Content-Range': 'bytes 100-199/1000', 'Content-Length': '100' }
  }), {
    setTimeoutImpl(callback, delay) {
      const timerId = ++timerSequence;
      scheduled.set(timerId, { callback, delay });
      return timerId;
    },
    clearTimeoutImpl(timerId) {
      scheduled.delete(timerId);
    }
  });
  const messages = worker.addClient('A');
  worker.setToken('A', 'valid');
  const response = await worker.request('A', { traceId: 'trace-empty-first-chunk' }).response;
  const pendingRead = response.body.getReader().read();
  await Promise.resolve();
  sourceController.enqueue(new Uint8Array(0));
  await Promise.resolve();
  assert.equal(scheduled.size, 1);
  assert.equal([...scheduled.values()][0].delay, 15_000);
  [...scheduled.values()][0].callback();

  await assert.rejects(pendingRead, { name: 'MediaFirstByteTimeoutError' });
  await new Promise((resolve) => setImmediate(resolve));
  const trace = messages.filter((message) => message.type === 'MEDIA_TRACE_EVENT');
  assert.equal(trace.some((message) => message.stage === 'first-byte'), false);
  assert.equal(trace.filter((message) => message.stage === 'first-byte-timeout').length, 1);
  assert.equal(messages.filter((message) => message.type === 'MEDIA_PROXY_ERROR').length, 1);
});

test('consumer cancellation before the first byte clears the deadline without a proxy failure', async () => {
  const scheduled = new Map();
  let timerSequence = 0;
  let upstreamCancelled = false;
  const worker = createWorker((url, { signal }) => {
    signal.addEventListener('abort', () => { upstreamCancelled = true; }, { once: true });
    return new Response(new ReadableStream({
      cancel() { upstreamCancelled = true; }
    }), {
      status: 206,
      headers: { 'Content-Range': 'bytes 100-199/1000', 'Content-Length': '100' }
    });
  }, {
    setTimeoutImpl(callback, delay) {
      const timerId = ++timerSequence;
      scheduled.set(timerId, { callback, delay });
      return timerId;
    },
    clearTimeoutImpl(timerId) {
      scheduled.delete(timerId);
    }
  });
  const messages = worker.addClient('A');
  worker.setToken('A', 'valid');
  const response = await worker.request('A', { traceId: 'trace-consumer-before-byte' }).response;
  const reader = response.body.getReader();
  const pendingRead = reader.read();
  await Promise.resolve();
  assert.equal([...scheduled.values()][0]?.delay, 15_000);

  await reader.cancel('consumer stopped');
  const read = await pendingRead;
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(read.done, true);
  assert.equal(upstreamCancelled, true);
  assert.equal(scheduled.size, 0);
  assert.equal(messages.some((message) => message.type === 'MEDIA_PROXY_ERROR'), false);
  const trace = messages.filter((message) => message.type === 'MEDIA_TRACE_EVENT');
  assert.equal(trace.at(-1).stage, 'request-cancelled');
  assert.equal(trace.at(-1).reason, 'consumer-cancelled');
  assert.equal(trace.some((message) => message.stage === 'first-byte-timeout'), false);
});

test('truncated 206 EOF is a body-length error, never a first-byte timeout', async () => {
  const scheduled = new Map();
  let timerSequence = 0;
  const worker = createWorker(() => new Response(new ReadableStream({
    start(controller) { controller.close(); }
  }), {
    status: 206,
    headers: { 'Content-Range': 'bytes 100-199/1000' }
  }), {
    setTimeoutImpl(callback, delay) {
      const timerId = ++timerSequence;
      scheduled.set(timerId, { callback, delay });
      return timerId;
    },
    clearTimeoutImpl(timerId) {
      scheduled.delete(timerId);
    }
  });
  const messages = worker.addClient('A');
  worker.setToken('A', 'valid');
  const response = await worker.request('A', { traceId: 'trace-empty-body' }).response;
  const pendingRead = response.body.getReader().read();
  await assert.rejects(pendingRead, { name: 'MediaBodyLengthError' });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(scheduled.size, 0);
  const failures = messages.filter((message) => message.type === 'MEDIA_PROXY_ERROR');
  assert.equal(failures.length, 1);
  assert.equal(failures[0].category, 'network');
  assert.equal(failures[0].driveReason, 'bodyLengthMismatch');
  const trace = messages.filter((message) => message.type === 'MEDIA_TRACE_EVENT');
  assert.equal(trace.at(-1).stage, 'body-error');
  assert.equal(trace.at(-1).reason, 'body-length-mismatch');
  assert.equal(trace.some((message) => message.stage === 'first-byte-timeout'), false);
});

test('an oversized 206 chunk is rejected before any byte reaches the consumer', async () => {
  let sourceController;
  let upstreamSignal;
  const worker = createWorker((url, { signal }) => {
    upstreamSignal = signal;
    return new Response(new ReadableStream({
      start(controller) { sourceController = controller; }
    }), {
      status: 206,
      headers: { 'Content-Range': 'bytes 100-199/1000' }
    });
  });
  const messages = worker.addClient('A');
  worker.setToken('A', 'valid');
  const response = await worker.request('A', { traceId: 'trace-body-overrun' }).response;
  const pendingRead = response.body.getReader().read();
  sourceController.enqueue(new Uint8Array(101));

  await assert.rejects(pendingRead, { name: 'MediaBodyLengthError' });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(upstreamSignal.aborted, true);
  const failures = messages.filter((message) => message.type === 'MEDIA_PROXY_ERROR');
  assert.equal(failures.length, 1);
  assert.equal(failures[0].driveReason, 'bodyLengthMismatch');
  const trace = messages.filter((message) => message.type === 'MEDIA_TRACE_EVENT');
  assert.equal(trace.filter((message) => message.stage === 'body-error').length, 1);
  assert.equal(trace.at(-1).reason, 'body-length-mismatch');
  assert.equal(trace.some((message) => message.stage === 'first-byte'), false);
});

test('non-OK response bodies release caller abort linkage after EOF and bodyless HEAD', async () => {
  let getSignal;
  const getWorker = createWorker((url, { signal }) => {
    getSignal = signal;
    return errorResponse(503, 'backendError');
  });
  getWorker.addClient('A');
  getWorker.setToken('A', 'valid');
  const getCaller = new AbortController();
  const getResponse = await getWorker.request('A', { signal: getCaller.signal }).response;
  assert.equal(getResponse.status, 503);
  await getResponse.text();
  assert.equal(getSignal.aborted, false);
  getCaller.abort();
  assert.equal(getSignal.aborted, false);

  let headSignal;
  const headWorker = createWorker((url, { signal }) => {
    headSignal = signal;
    return new Response(null, { status: 503 });
  });
  headWorker.addClient('A');
  headWorker.setToken('A', 'valid');
  const headCaller = new AbortController();
  const headResponse = await headWorker.request('A', {
    method: 'HEAD', signal: headCaller.signal
  }).response;
  assert.equal(headResponse.status, 503);
  assert.equal(headSignal.aborted, false);
  headCaller.abort();
  assert.equal(headSignal.aborted, false);
});

test('non-OK body finalizer releases exactly once on consumer cancel and upstream error', async () => {
  for (const ending of ['consumer-cancel', 'upstream-error']) {
    let sourceController;
    let sourceCancelled = false;
    let aborts = 0;
    let releases = 0;
    const body = new ReadableStream({
      start(controller) { sourceController = controller; },
      cancel() { sourceCancelled = true; }
    });
    const attempt = {
      abort(reason) {
        aborts++;
        sourceController.error(reason);
      },
      release() { releases++; }
    };
    const worker = createWorker(() => { throw new Error('not used'); });
    worker.context.__testErrorBody = body;
    worker.context.__testErrorAttempt = attempt;
    const wrapped = vm.runInContext(
      'finalizeMediaResponseBody(__testErrorBody, __testErrorAttempt)',
      worker.context
    );
    const reader = wrapped.getReader();
    const pendingRead = reader.read();
    await Promise.resolve();

    if (ending === 'consumer-cancel') {
      await reader.cancel('consumer stopped');
      assert.equal((await pendingRead).done, true);
      assert.equal(aborts, 1);
      assert.equal(sourceCancelled || aborts === 1, true);
    } else {
      const upstreamError = new Error('upstream ended');
      upstreamError.name = 'AbortError';
      sourceController.error(upstreamError);
      await assert.rejects(pendingRead, { name: 'AbortError' });
      assert.equal(aborts, 0);
    }
    assert.equal(releases, 1, ending);
  }
});

test('caller cancellation remains linked to the upstream body after headers arrive', async () => {
  let upstreamSignal;
  const scheduled = new Map();
  let timerSequence = 0;
  const worker = createWorker((url, { signal }) => {
    upstreamSignal = signal;
    return new Response(new ReadableStream({
      start(controller) {
        signal.addEventListener('abort', () => controller.error(signal.reason), { once: true });
      }
    }), {
      status: 206,
      headers: { 'Content-Range': 'bytes 100-199/1000', 'Content-Length': '100' }
    });
  }, {
    setTimeoutImpl(callback, delay) {
      const timerId = ++timerSequence;
      scheduled.set(timerId, { callback, delay });
      return timerId;
    },
    clearTimeoutImpl(timerId) {
      scheduled.delete(timerId);
    }
  });
  const messages = worker.addClient('A');
  worker.setToken('A', 'valid');
  const controller = new AbortController();
  const result = await worker.request('A', {
    signal: controller.signal,
    traceId: 'trace-body-request-cancel'
  }).response;
  const pendingRead = result.body.getReader().read();
  await Promise.resolve();
  assert.equal([...scheduled.values()][0]?.delay, 15_000);

  controller.abort(new Error('custom caller cancellation'));

  assert.equal(upstreamSignal.aborted, true);
  await assert.rejects(pendingRead, { name: 'Error', message: 'custom caller cancellation' });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(scheduled.size, 0);
  assert.equal(messages.some((message) => message.type === 'MEDIA_PROXY_ERROR'), false);
  const trace = messages.filter((message) => message.type === 'MEDIA_TRACE_EVENT');
  assert.equal(trace.at(-1).stage, 'request-cancelled');
  assert.equal(trace.at(-1).reason, 'body-aborted');
  assert.equal(trace.some((message) => message.stage === 'first-byte-timeout'), false);
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
    worker.clearToken('A');
    tokenReply(message, port, 'late');
  });
  assert.equal((await worker.request('A').response).status, 401);
  assert.equal(vm.runInContext('clientCredentials.has("A")', worker.context), false);
});

test('a late CLEAR_TOKEN cannot erase a newer credential revision', async () => {
  const worker = createWorker(() => partialResponse('new credential bytes'));
  worker.addClient('A');
  worker.setToken('A', 'older', { revision: 10 });
  worker.setToken('A', 'newer', { revision: 11 });
  worker.clearToken('A', { revision: 10 });

  const response = await worker.request('A').response;

  assert.equal(response.status, 206);
  assert.equal(await response.text(), 'new credential bytes');
  assert.equal(worker.calls[0].headers.get('Authorization'), 'Bearer newer');
  assert.equal(vm.runInContext('clientCredentials.get("A").revision', worker.context), 11);
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

test('opt-in media trace correlates credential, headers, first byte and body completion without secrets', async () => {
  const worker = createWorker(() => new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array([1, 2, 3, 4]));
      controller.close();
    }
  }), {
    status: 206,
    headers: { 'Content-Range': 'bytes 100-103/1000', 'Content-Length': '4' }
  }));
  const messages = worker.addClient('A');
  worker.setToken('A', 'private-token-value');
  const response = await worker.request('A', {
    range: 'bytes=100-103',
    traceId: 'trace-safe-1'
  }).response;
  assert.equal(response.status, 206);
  assert.equal((await response.arrayBuffer()).byteLength, 4);
  await new Promise((resolve) => setImmediate(resolve));

  const trace = messages.filter((message) => message.type === 'MEDIA_TRACE_EVENT');
  assert.deepEqual(trace.map((message) => message.stage), [
    'credential-requested',
    'credential-ready',
    'request-start',
    'headers',
    'first-byte',
    'body-progress',
    'body-complete'
  ]);
  assert.ok(trace.every((message) => message.traceId === 'trace-safe-1'));
  assert.ok(trace.every((message) => message.requestId === 'media-1'));
  assert.ok(trace.every((message) => message.sessionId === '7'));
  assert.deepEqual(trace.map((message) => message.sequence), [1, 2, 3, 4, 5, 6, 7]);
  const serialized = JSON.stringify(trace);
  assert.doesNotMatch(serialized, /private-token-value|Authorization|fileA|googleapis\.com/);
});

test('opt-in media trace distinguishes a missing credential from a rejected upstream credential', async () => {
  const missingWorker = createWorker(() => { throw new Error('must not fetch'); });
  const missingMessages = missingWorker.addClient('A', (message, port) => tokenReply(message, port, null));
  const missing = await missingWorker.request('A', { traceId: 'trace-missing' }).response;
  assert.equal(missing.status, 401);
  assert.deepEqual(
    missingMessages.filter((message) => message.type === 'MEDIA_TRACE_EVENT').map((message) => message.stage),
    ['credential-requested', 'credential-missing']
  );

  const rejectedWorker = createWorker(() => errorResponse(401));
  const rejectedMessages = rejectedWorker.addClient('A', (message, port) => tokenReply(message, port, 'old'));
  rejectedWorker.setToken('A', 'old');
  const rejected = await rejectedWorker.request('A', { traceId: 'trace-rejected' }).response;
  assert.equal(rejected.status, 401);
  await new Promise((resolve) => setImmediate(resolve));
  const rejectedTrace = rejectedMessages.filter((message) => message.type === 'MEDIA_TRACE_EVENT');
  assert.deepEqual(rejectedTrace.map((message) => message.stage), [
    'credential-requested', 'credential-ready',
    'request-start', 'headers', 'request-start', 'headers', 'http-error'
  ]);
  assert.equal(rejectedWorker.calls.length, 2);
  assert.equal(rejectedTrace.at(-1).status, 401);
  assert.equal(rejectedTrace.at(-1).reason, 'denied');
});

test('opt-in media trace records cancellation without converting it into an HTTP failure', async () => {
  let upstreamStarted;
  const started = new Promise((resolve) => { upstreamStarted = resolve; });
  const worker = createWorker((url, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    upstreamStarted();
  }));
  const messages = worker.addClient('A');
  worker.setToken('A', 'valid');
  const controller = new AbortController();
  const pending = worker.request('A', { signal: controller.signal, traceId: 'trace-cancelled' }).response;
  await started;
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  await new Promise((resolve) => setImmediate(resolve));
  const trace = messages.filter((message) => message.type === 'MEDIA_TRACE_EVENT');
  assert.equal(trace.at(-1).stage, 'request-cancelled');
  assert.equal(trace.at(-1).reason, 'request-aborted');
  assert.equal(trace.some((message) => message.stage === 'http-error'), false);
});

test('opt-in response-body cancellation propagates upstream after headers and first byte', async () => {
  let sourceController;
  let upstreamCancelled = false;
  const upstreamBody = new ReadableStream({
    start(controller) { sourceController = controller; },
    cancel() { upstreamCancelled = true; }
  });
  const worker = createWorker(() => new Response(upstreamBody, {
    status: 206,
    headers: { 'Content-Range': 'bytes 100-115/1000', 'Content-Length': '16' }
  }));
  const messages = worker.addClient('A');
  worker.setToken('A', 'valid');
  const response = await worker.request('A', {
    range: 'bytes=100-115', traceId: 'trace-consumer-cancel'
  }).response;
  const reader = response.body.getReader();
  const firstRead = reader.read();
  sourceController.enqueue(new Uint8Array([1]));
  await firstRead;
  await reader.cancel('consumer stopped');
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(upstreamCancelled, true);
  const trace = messages.filter((message) => message.type === 'MEDIA_TRACE_EVENT');
  assert.deepEqual(trace.slice(-2).map((message) => message.stage), ['first-byte', 'request-cancelled']);
  assert.equal(trace.at(-1).reason, 'consumer-cancelled');
  assert.equal(trace.some((message) => message.stage === 'body-complete'), false);
});

function shellWorkerFixture({ addAll, clientURL='https://app.test/drive-original/', timers }={}) {
  const worker=createWorker(async()=>{throw Error('refresh must use only the cache batch');},timers||{}), batches=[], replies=[];
  const own={};worker.context.self.registration={scope:'https://app.test/drive-original/',active:own};worker.context.self.serviceWorker=own;
  worker.context.self.clients.get=async id=>({id,type:'window',url:clientURL});
  worker.context.caches={open:async name=>({addAll:async requests=>{batches.push({name,requests});await addAll?.(requests);}})};
  function send(overrides={},sourceOverrides={}) { const port={postMessage:data=>replies.push(data),close(){this.closed=true;}};
    worker.context.refreshEvent={data:{type:'APP_SHELL_REFRESH',protocol:'drive-original-shell-refresh-v1',requestId:'shell-1',...overrides},
      source:{id:'owned-client',type:'window',...sourceOverrides},ports:[port]};
    const result=vm.runInContext('handleAppShellRefresh(refreshEvent)',worker.context);return{result,port}; }
  return{worker,batches,replies,send};
}

test('shell refresh batches the authoritative complete shell, coalesces clients, and leaves credentials and media fences intact',async()=>{
  let release;const pending=new Promise(resolve=>release=resolve);const f=shellWorkerFixture({addAll:()=>pending});
  vm.runInContext("clientCredentials.set('A',{token:'fixture'});q1CleanupFences.set('A',true);",f.worker.context);
  const first=f.send(),second=f.send({requestId:'shell-2'});await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.batches.length,1);const batch=f.batches[0];
  const expected=Array.from(vm.runInContext('SHELL_FILES',f.worker.context),name=>new URL(name,f.worker.context.self.registration.scope).href);
  assert.equal(batch.requests.length,expected.length);
  assert.equal(new Set(batch.requests.map(r=>r.url)).size,expected.length);
  assert.deepEqual(Array.from(batch.requests,r=>r.url).sort(),expected.sort());
  assert(batch.requests.every(r=>r.cache==='no-store'&&r.signal));
  assert(batch.requests.every(r=>r.url.startsWith('https://app.test/drive-original/')&&!r.url.includes('/__drive_media/')&&!/\.(?:tgz|tar\.gz)(?:\.part\d+)?$/.test(r.url)));
  const publicFiles=require('../scripts/public-files.cjs');
  const q3Runtime=publicFiles.filter(file=>file.startsWith('media/video-q3-'));
  assert.equal(q3Runtime.length,6);
  for(const file of q3Runtime)assert(batch.requests.some(r=>r.url===new URL(file,f.worker.context.self.registration.scope).href),file);
  for(const file of ['licenses/video-q3-source.tgz','licenses/video-q3-source-manifest.json','licenses/video-q3-source-NOTICE.md']){
    assert(publicFiles.includes(file),file);
    assert(!batch.requests.some(r=>r.url===new URL(file,f.worker.context.self.registration.scope).href),file);
  }
  assert(batch.requests.some(r=>r.url.endsWith('/media/audio-codec.wasm')));
  release();await Promise.all([first.result,second.result]);assert.equal(f.replies.length,2);assert(f.replies.every(r=>r.ok===true));
  assert(first.port.closed&&second.port.closed);assert.equal(vm.runInContext("clientCredentials.get('A').token",f.worker.context),'fixture');
  assert.equal(vm.runInContext("q1CleanupFences.get('A')",f.worker.context),true);
});

test('shell refresh rejects foreign, sibling-prefix, non-window and inactive owners before any cache batch',async()=>{
  for(const clientURL of ['https://other.test/drive-original/','https://app.test/drive-original-evil/','https://app.test/other/','https://app.test/drive-original/nested/']) {
    const f=shellWorkerFixture({clientURL});const call=f.send();await call.result;assert.equal(f.batches.length,0);assert.equal(f.replies[0]?.ok,false);assert(call.port.closed);
  }
  const f=shellWorkerFixture();f.worker.context.self.registration.active={};await f.send().result;assert.equal(f.batches.length,0);
  for(const [data,source] of [[{protocol:'wrong'},{}],[{requestId:'bad/secret'},{}],[{},{type:'worker'}]]){
    const x=shellWorkerFixture();await x.send(data,source).result;assert.equal(x.batches.length,0);assert.equal(x.replies.length,0);
  }
});

test('shell refresh network failure retains the prior atomic cache batch and permits a later explicit retry',async()=>{
  const stored=new Map([['old','unchanged']]);let fail=true;const f=shellWorkerFixture({addAll:async requests=>{if(fail)throw Error('HTTP503');stored.set('complete',requests.length);}});
  await f.send().result;assert.equal(f.replies[0].ok,false);assert.equal(f.replies[0].code,'network');assert.deepEqual([...stored],[['old','unchanged']]);
  fail=false;await f.send({requestId:'shell-2'}).result;assert.equal(f.batches.length,2);assert.equal(f.replies[1].ok,true);assert.equal(stored.get('old'),'unchanged');
});

test('shell refresh timeout aborts its network requests and prevents overlapping work until the old batch settles',async()=>{
  const timers=[];let release;const pending=new Promise(resolve=>release=resolve);const f=shellWorkerFixture({addAll:()=>pending,
    timers:{setTimeoutImpl:(fn,ms)=>{const t={fn,ms};timers.push(t);return t;},clearTimeoutImpl:()=>{}}});
  const call=f.send();await new Promise(resolve=>setImmediate(resolve));const deadline=timers.find(t=>t.ms===15000);assert(deadline);deadline.fn();
  await call.result;assert.equal(f.replies[0].code,'timeout');assert(f.batches[0].requests.every(r=>r.signal.aborted));
  await f.send({requestId:'shell-2'}).result;assert.equal(f.batches.length,1);assert.equal(f.replies[1].code,'timeout');
  release();await new Promise(resolve=>setImmediate(resolve));assert.equal(vm.runInContext('shellRefreshTask',f.worker.context),null);
});
