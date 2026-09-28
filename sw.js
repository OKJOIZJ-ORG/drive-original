const VERSION = '1.22.0-rc.10';
const SHELL_CACHE = `drive-original-shell-${VERSION}`;
const MEDIA_MARKER = '/__drive_media/';
const AUTH_PROTOCOL = 'drive-original-auth-v1';
const CREDENTIAL_REQUEST_TIMEOUT_MS = 58_000;
const MEDIA_HEADERS_TIMEOUT_MS = 10_000;
const Q1_REJECTED_BODY_CLEANUP_TIMEOUT_MS = 2_000;
const MEDIA_FIRST_BYTE_TIMEOUT_MS = 15_000;
const MEDIA_BODY_NO_PROGRESS_TIMEOUT_MS = 15_000;
const SHELL_FILES = [
  './',
  './index.html',
  './styles.css',
  './runtime-config.js',
  './app.js',
  './media/drive-source.mjs',
  './media/ts-player.mjs',
  './media/q1-core.mjs',
  './media/transmux-worker.mjs',
  './media/mux-mp4.min.js',
  './media/mux-LICENSE.txt',
  './version.json',
  './manifest.webmanifest',
  './icons/app-icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png'
];

// A worker controls several tabs/PWA windows. Credentials belong to the
// requesting client, never to whichever window sent a message most recently.
const clientCredentials = new Map();
const tokenRequests = new Map();
// Failed Q1 remote cleanup cannot be repaired by a new credential or source.
// This fence belongs only to that controlled client and this worker lifetime.
const q1CleanupFences = new Map();
const Q1_RETIRE_PROTOCOL = 'drive-original-q1-retirement-v1';
const q1TransportOwners = new Map();
const q1RetiredThrough = new Map();
let requestSequence = 0;
let mediaTraceSequence = 0;
const MEDIA_TRACE_PROGRESS_INTERVAL_MS = 250;
const mediaTraceDeliveryQueues = new Map();

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_FILES))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((key) => key.startsWith('drive-original-shell-') && key !== SHELL_CACHE)
          .map((key) => caches.delete(key))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  const data = event.data || {};
  const clientId = event.source?.id;
  if (data.type === 'Q1_RETIRE_REQUEST' && event.ports?.[0]) {
    const operation = replyQ1Retirement(event, data, clientId);
    event.waitUntil?.(operation);
    return;
  }
  if (data.type === 'SET_TOKEN' && clientId) {
    const credential = normalizeCredential(data);
    const current = clientCredentials.get(clientId);
    if (credential && shouldAcceptCredential(current, credential)) {
      clientCredentials.set(clientId, credential);
    }
  }
  if (data.type === 'CLEAR_TOKEN' && clientId) {
    const current = clientCredentials.get(clientId);
    const accepted = current ? clearMatchesCredential(data, current) : isValidClearMessage(data);
    if (current && accepted) clientCredentials.delete(clientId);
    if (accepted) {
      for (const pending of tokenRequests.values()) {
        if (pending.clientId === clientId
          && pending.accountGeneration === data.accountGeneration
          && (!pending.expectedAccount || pending.expectedAccount === data.account)) {
          pending.finish(null);
        }
      }
    }
  }
  if (data.type === 'TOKEN_RESPONSE' && clientId) {
    const pending = tokenRequests.get(data.requestId);
    if (pending?.clientId === clientId) pending.respond(data);
  }
  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  const scope = workerScopeUrl();
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;

  // Version discovery is never satisfied from an old offline shell.
  if (url.pathname === new URL('version.json', scope).pathname) {
    event.respondWith(fetch(event.request, { cache: 'no-store' }));
    return;
  }

  // 2. Stream proxy for Drive media
  if (url.pathname.startsWith(`${scope.pathname}__drive_media/`)) {
    event.respondWith(proxyDriveMedia(event.request, url, event.clientId));
    return;
  }

  if (event.request.method !== 'GET' || !shellAssetCacheKey(event.request)) return;

  // 3. For all local shell assets (HTML, JS, CSS, icons): Network-First, fallback to Cache!
  event.respondWith(networkFirstAsset(event.request));
});

function workerScopeUrl() {
  return new URL(self.registration?.scope || './', self.location.href || `${self.location.origin}/`);
}

function shellAssetCacheKey(request) {
  const url = new URL(request.url);
  const scope = workerScopeUrl();
  if (url.origin !== scope.origin) return null;
  const known = SHELL_FILES.some((name) => new URL(name, scope).pathname === url.pathname);
  if (!known || url.pathname === new URL('version.json', scope).pathname) return null;
  // Static deployment query strings do not change file bytes. Canonical keys
  // make ?v= releases and the first offline launch use the installed shell.
  url.search = '';
  url.hash = '';
  return url.href;
}

async function networkFirstAsset(request) {
  const cacheKey = shellAssetCacheKey(request);
  if (!cacheKey) return fetch(request);
  let response;
  try {
    response = await fetch(request);
    if (response && response.ok) {
      try {
        const cache = await caches.open(SHELL_CACHE);
        await cache.put(cacheKey, response.clone());
      } catch (_) { /* Cache quota/private mode must not break a good network response. */ }
      return response;
    }
  } catch (_) { /* Recover network failures from this application's shell only. */ }
  try {
    const cache = await caches.open(SHELL_CACHE);
    const cached = await cache.match(cacheKey);
    if (cached) return cached;
    if (request.mode === 'navigate') {
      const fallback = await cache.match(new URL('index.html', workerScopeUrl()).href);
      if (fallback) return fallback;
    }
  } catch (_) { /* The original HTTP error remains more useful than a cache error. */ }
  return response || Response.error();
}

async function proxyDriveMedia(request, url, clientId) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return mediaErrorResponse('Method not allowed', 405);
  }
  const fileId = extractFileId(url.pathname);
  if (!fileId || !/^[A-Za-z0-9_-]+$/.test(fileId)) {
    return mediaErrorResponse('Invalid Drive file ID', 400);
  }
  if (!url.searchParams.has('accountGeneration')
    || !/^\d+$/.test(url.searchParams.get('accountGeneration') || '')) {
    return mediaErrorResponse('Invalid account generation', 400);
  }
  const sourceGenerationValue = url.searchParams.get('sourceGeneration');
  if (sourceGenerationValue != null && !/^\d+$/.test(sourceGenerationValue)) {
    return mediaErrorResponse('Invalid media source generation', 400);
  }
  const sourceGeneration = sourceGenerationValue == null ? null : Number(sourceGenerationValue);
  if (sourceGeneration != null && (!Number.isSafeInteger(sourceGeneration) || sourceGeneration < 0)) {
    return mediaErrorResponse('Invalid media source generation', 400);
  }
  const context = {
    requestId: `media-${++requestSequence}`,
    clientId: clientId || '',
    fileId,
    sessionId: url.searchParams.get('mediaSession') || url.searchParams.get('session'),
    accountGeneration: Number(url.searchParams.get('accountGeneration')),
    requireCurrentMedia: url.searchParams.get('mediaOwner') === 'q1',
    requestedRange: request.headers.get('range'),
    traceId: normalizeMediaTraceId(url.searchParams.get('_trace')),
    ...(sourceGeneration == null ? {} : { sourceGeneration })
  };
  if (!Number.isSafeInteger(context.accountGeneration) || context.accountGeneration < 0) {
    return mediaErrorResponse('Invalid account generation', 400);
  }
  if (context.requireCurrentMedia && (!clientId || !Number.isSafeInteger(sourceGeneration))) {
    return mediaErrorResponse('Invalid Q1 media owner', 400);
  }
  if (context.requireCurrentMedia && sourceGeneration <= (q1RetiredThrough.get(clientId) ?? -1)) {
    return mediaErrorResponse('Q1 media source retired', 409);
  }
  // `mediaSession` is retained until all controlled clients have moved to the
  // clearer `sessionId` field.
  context.mediaSession = context.sessionId;
  const range = context.requestedRange;
  const sizeValue = url.searchParams.get('size');
  if ((range != null && !parseRequestedByteRange(range))
    || (sizeValue != null && parsePositiveSafeInteger(sizeValue) == null)) {
    notifyMediaTrace(context, 'range-error', {
      status: 400,
      reason: 'range-invalid',
      rangeSatisfied: false,
      terminal: true
    });
    await notifyMediaError(context, 400, ['rangeInvalid'], 0, {
      category: 'range-invalid',
      contentRange: null,
      contentRangeInferred: false,
      rangeSatisfied: false,
      driveReason: 'rangeInvalid'
    });
    return mediaErrorResponse('Invalid media byte range', 400);
  }
  const driveUrl = new URL(`https://www.googleapis.com/drive/v3/files/${fileId}`);
  driveUrl.searchParams.set('alt', 'media');
  driveUrl.searchParams.set('supportsAllDrives', 'true');
  if (url.searchParams.get('acknowledgeAbuse') === '1') {
    driveUrl.searchParams.set('acknowledgeAbuse', 'true');
  }
  const headers = new Headers();

  const resourceKey = url.searchParams.get('resourceKey');
  if (resourceKey) {
    headers.set('X-Goog-Drive-Resource-Keys', `${fileId}/${resourceKey}`);
  }

  if (range) {
    headers.set('Range', range);
  }

  const owner = context.requireCurrentMedia ? registerQ1TransportOwner(context, request.signal) : null;
  const transportSignal = owner?.controller.signal || request.signal;

  try {
    transportSignal.throwIfAborted();
    if (context.requireCurrentMedia && !await waitForQ1CleanupFence(clientId)) {
      return q1CleanupUnconfirmedResponse();
    }
    transportSignal.throwIfAborted();
    notifyMediaTrace(context, 'credential-requested');
    let credential = await getUsableCredential(context, { signal: transportSignal });
    transportSignal.throwIfAborted();
    if (!credential) {
      notifyMediaTrace(context, 'credential-missing', {
        reason: 'no-usable-credential', terminal: true
      });
      await notifyMediaError(context, 401);
      return mediaErrorResponse('Google authorization required', 401);
    }
    notifyMediaTrace(context, 'credential-ready');
    let upstreamAttempt = 0;
    const fetchMedia = async () => {
      transportSignal.throwIfAborted();
      headers.set('Authorization', `Bearer ${credential.token}`);
      upstreamAttempt += 1;
      notifyMediaTrace(context, 'request-start', { attempt: upstreamAttempt });
      const attempt = await fetchMediaWithHeadersDeadline(driveUrl.toString(), {
        method: request.method,
        headers,
        redirect: 'follow',
        mode: 'cors',
        cache: 'no-store'
      }, transportSignal);
      if (owner) owner.upstream = attempt;
      const response = attempt.response;
      notifyMediaTrace(context, 'headers', {
        attempt: upstreamAttempt,
        status: response.status,
        totalBytes: Number(response.headers.get('Content-Length')) || 0
      });
      return attempt;
    };
    let upstreamFetch = await fetchMedia();
    let upstream = upstreamFetch.response;
    if (upstream.status === 401) {
      // A page fetch abort does not reliably cancel an intercepted SW fetch.
      // Release the rejected body before the final Q1 owner handshake; a close
      // during cleanup or credential refresh must never authorize a new Range.
      if (context.requireCurrentMedia) {
        const settled = await fenceQ1RejectedBody(clientId, upstreamFetch, transportSignal);
        if (!settled) {
          return q1CleanupUnconfirmedResponse();
        }
        upstream = new Response(null, { status: upstream.status, statusText: upstream.statusText, headers: upstream.headers });
      }
      const rejectedCredential = credential;
      const cached = clientCredentials.get(clientId);
      // The server revision, not the token string, fences concurrent refreshes.
      // Google may return the same access-token string with a newer revision.
      if (credentialMatchesContext(cached, context)
        && isUsableCredential(cached)
        && cached.account === rejectedCredential.account
        && cached.revision > rejectedCredential.revision) {
        credential = context.requireCurrentMedia ? await getUsableCredential(context, {
          rejectedRevision: rejectedCredential.revision,
          expectedAccount: rejectedCredential.account,
          signal: transportSignal
        }) : cached;
      } else {
        if (sameCredential(clientCredentials.get(clientId), rejectedCredential)) {
          clientCredentials.delete(clientId);
        }
        credential = await getUsableCredential(context, {
          forceRefresh: true,
          rejectedRevision: rejectedCredential.revision,
          expectedAccount: rejectedCredential.account,
          signal: transportSignal
        });
      }
      if (credential
        && credential.account === rejectedCredential.account
        && credential.revision > rejectedCredential.revision) {
        if (!context.requireCurrentMedia) await upstream.body?.cancel();
        upstreamFetch.release();
        upstreamFetch = await fetchMedia();
        upstream = upstreamFetch.response;
      }
    }

    transportSignal.throwIfAborted();
    if (!upstream.ok) {
      if (upstream.status === 401 && sameCredential(clientCredentials.get(clientId), credential)) {
        clientCredentials.delete(clientId);
      }
      let reasons = [];
      try {
        const body = await upstream.clone().json();
        reasons = (body?.error?.errors || []).map((item) => item?.reason).filter(Boolean);
      } catch (_) {}
      const retryAfterMs = parseRetryAfterMs(upstream.headers.get('Retry-After'));
      const contentRange = upstream.headers.get('Content-Range');
      notifyMediaTrace(context, 'http-error', {
        status: upstream.status,
        reason: reasons[0] || (upstream.status === 401 ? 'credential-rejected' : 'upstream-http'),
        terminal: true
      });
      await notifyMediaError(context, upstream.status, reasons, retryAfterMs, {
        category: upstream.status === 416 ? 'range-unsatisfiable' : undefined,
        contentRange,
        rangeSatisfied: false,
        rejectedRevision: upstream.status === 401 ? credential?.revision : undefined,
        driveReason: reasons[0] || (upstream.status === 416 ? 'rangeNotSatisfiable' : null)
      });
      const errorHeaders = new Headers(upstream.headers);
      errorHeaders.set('Cache-Control', 'no-store');
      if (request.method === 'HEAD') upstreamFetch.release();
      const errorBody = request.method === 'HEAD'
        ? null
        : finalizeMediaResponseBody(upstream.body, upstreamFetch, owner);
      if (owner && errorBody) owner.bodyHanded = true;
      return new Response(errorBody, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: errorHeaders
      });
    }

    const exposedContentRange = upstream.headers.get('Content-Range');
    const inferredContentRange = upstream.status === 206 && !exposedContentRange
      ? inferContentRangeFromLength(
          range,
          url.searchParams.get('size'),
          upstream.headers.get('Content-Length')
        )
      : null;
    const contentRange = exposedContentRange || inferredContentRange;
    const contentRangeInferred = Boolean(inferredContentRange);
    const declaredLength = upstream.headers.get('Content-Length');
    const satisfiedInterval = parseSatisfiedContentRange(contentRange);
    const expectedRangeBytes = satisfiedInterval
      ? satisfiedInterval.end - satisfiedInterval.start + 1
      : 0;
    const expectedRangeLengthSafe = Number.isSafeInteger(expectedRangeBytes) && expectedRangeBytes > 0;
    const lengthConsistent = expectedRangeLengthSafe && (!declaredLength || (satisfiedInterval && /^\d+$/.test(declaredLength)
      && Number.isSafeInteger(Number(declaredLength))
      && Number(declaredLength) === expectedRangeBytes));
    const rangeSatisfied = upstream.status === 206
      && doesContentRangeSatisfy(range, contentRange) && Boolean(lengthConsistent);
    if (upstream.status === 206 && !rangeSatisfied) {
      if (owner) {
        if (!await fenceQ1RejectedBody(clientId, upstreamFetch, transportSignal)) return q1CleanupUnconfirmedResponse();
      } else {
        await upstream.body?.cancel();
        upstreamFetch.release();
      }
      notifyMediaTrace(context, 'range-error', {
        status: upstream.status,
        reason: 'range-invalid',
        rangeSatisfied: false,
        terminal: true
      });
      await notifyMediaError(context, upstream.status, ['rangeInvalid'], 0, {
        category: 'range-invalid',
        contentRange,
        contentRangeInferred,
        rangeSatisfied: false,
        driveReason: 'rangeInvalid'
      });
      return mediaErrorResponse('Drive returned an invalid byte range', 502);
    }

    const responseHeaders = new Headers(upstream.headers);
    responseHeaders.set('Access-Control-Allow-Origin', self.location.origin);
    responseHeaders.set('Access-Control-Allow-Credentials', 'true');
    responseHeaders.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    responseHeaders.set('Access-Control-Allow-Headers', 'Range, Authorization, Accept, Origin, Content-Type');
    responseHeaders.set('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length, Content-Type');
    responseHeaders.set('Cache-Control', 'private, no-store, no-transform');
    if (rangeSatisfied) {
      responseHeaders.set('Content-Range', contentRange);
      responseHeaders.set('Accept-Ranges', 'bytes');
    }

    // Force exact MIME type if known (prevents Safari application/octet-stream rejection)
    const mimeParam = url.searchParams.get('mime');
    if (mimeParam) {
      responseHeaders.set('Content-Type', mimeParam);
    }

    if (upstream.status === 200 || upstream.status === 206) {
      await notifyMediaStatus(context, {
        status: upstream.status,
        contentRange,
        contentRangeInferred,
        rangeSatisfied,
        playbackMode: rangeSatisfied ? 'original-range' : 'original-sequential'
      });
    }

    if (request.method === 'HEAD') upstreamFetch.release();
    const responseBody = request.method === 'HEAD'
      ? null
      : instrumentMediaResponseBody(upstream.body, context, {
          totalBytes: rangeSatisfied ? expectedRangeBytes : Number(declaredLength) || 0,
          status: upstream.status,
          rangeSatisfied,
          playbackMode: rangeSatisfied ? 'original-range' : 'original-sequential'
        }, upstreamFetch, transportSignal, owner);
    if (owner && responseBody) owner.bodyHanded = true;
    return new Response(responseBody, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders
    });
  } catch (error) {
    if (error?.name === 'Q1ClientUpgradeRequiredError') {
      await notifyMediaError(context, 409, [], 0, { category: 'client-upgrade-required', driveReason: 'q1RetirementProtocol' });
      return mediaErrorResponse('Q1 client upgrade required', 409);
    }
    if (error?.name === 'MediaHeadersTimeoutError') {
      notifyMediaTrace(context, 'http-error', {
        status: 504,
        reason: 'headers-timeout',
        terminal: true
      });
      await notifyMediaError(context, 504, [], 0, {
        category: 'timeout',
        driveReason: 'headersTimeout',
        rangeSatisfied: false
      });
      return mediaErrorResponse('Drive response headers timed out', 504);
    }
    if (transportSignal.aborted || error?.name === 'AbortError') {
      notifyMediaTrace(context, 'request-cancelled', {
        reason: 'request-aborted', terminal: true
      });
      throw error;
    }
    notifyMediaTrace(context, 'http-error', {
      status: 0,
      reason: 'network-failure',
      terminal: true
    });
    await notifyMediaError(context, 0, [], 0, {
      category: 'network',
      driveReason: 'networkFailure',
      rangeSatisfied: false
    });
    return mediaErrorResponse('Drive streaming request failed', 502);
  } finally {
    if (owner && !owner.bodyHanded) {
      const settled = !owner.upstream || await fenceQ1RejectedBody(clientId, owner.upstream);
      owner.complete(settled);
    }
  }
}

function markQ1CleanupUncertain(clientId) {
  const fence = q1CleanupFences.get(clientId) || {};
  fence.completion = Promise.resolve(false);
  q1CleanupFences.set(clientId, fence);
}

function registerQ1TransportOwner(context, callerSignal) {
  let resolve;
  const controller = new AbortController();
  const owner = { clientId: context.clientId, sourceGeneration: context.sourceGeneration,
    controller, upstream: null, bodyHanded: false, cancelBody: null, retiring: false, finished: false,
    completion: new Promise(done => { resolve = done; }),
    retire() {
      owner.retiring = true;
      // Start real body cancellation before aborting its transport. The query
      // never treats the abort request itself as a completion acknowledgement.
      const cancellation = owner.cancelBody?.();
      cancellation?.catch(() => {});
      controller.abort();
    },
    complete(settled) {
      if (owner.finished) return;
      owner.finished = true;
      callerSignal.removeEventListener('abort', retired);
      if (!settled) markQ1CleanupUncertain(context.clientId);
      q1TransportOwners.delete(context.requestId);
      resolve(settled === true);
    }
  };
  const retired = () => owner.retire();
  q1TransportOwners.set(context.requestId, owner);
  callerSignal.addEventListener('abort', retired, { once: true });
  if (callerSignal.aborted) retired();
  return owner;
}

async function replyQ1Retirement(event, data, clientId) {
  const port = event.ports[0];
  const valid = clientId && data.protocol === Q1_RETIRE_PROTOCOL
    && typeof data.requestId === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(data.requestId)
    && Number.isSafeInteger(data.retiredThroughGeneration) && data.retiredThroughGeneration >= 0;
  let settled = false, timer;
  try {
    if (valid) {
      q1RetiredThrough.set(clientId, Math.max(q1RetiredThrough.get(clientId) ?? -1, data.retiredThroughGeneration));
      const owners = [...q1TransportOwners.values()].filter(owner => owner.clientId === clientId
        && owner.sourceGeneration <= data.retiredThroughGeneration);
      owners.forEach(owner => owner.retire());
      const confirmation = Promise.all(owners.map(owner => owner.completion)).then(async values =>
        values.every(Boolean) && await waitForQ1CleanupFence(clientId));
      settled = await Promise.race([confirmation, new Promise(resolve => {
        timer = setTimeout(() => resolve(false), Q1_REJECTED_BODY_CLEANUP_TIMEOUT_MS);
      })]);
      if (!settled) markQ1CleanupUncertain(clientId);
    }
    port.postMessage({ type: 'Q1_RETIRE_RESPONSE', protocol: Q1_RETIRE_PROTOCOL,
      requestId: data.requestId, retiredThroughGeneration: data.retiredThroughGeneration, settled: settled === true });
  } catch (_) { if (valid) markQ1CleanupUncertain(clientId); }
  finally { clearTimeout(timer); port.close(); void pruneQ1CleanupFences(); }
}

function q1CleanupUnconfirmedResponse() {
  const response = mediaErrorResponse('Q1 rejected body cleanup unconfirmed', 502);
  response.headers.set('X-Drive-Original-Q1-Cleanup', 'unconfirmed');
  return response;
}

async function waitForQ1CleanupFence(clientId) {
  for (;;) {
    const fence = q1CleanupFences.get(clientId);
    if (!fence) return true;
    const pending = fence.completion;
    if (!await pending) return false;
    // Another already-started request may have registered cleanup meanwhile.
    if (q1CleanupFences.get(clientId) === fence && fence.completion === pending) return true;
  }
}

function fenceQ1RejectedBody(clientId, upstreamFetch, signal) {
  const fence = q1CleanupFences.get(clientId) || { completion: Promise.resolve(true) };
  q1CleanupFences.set(clientId, fence);
  const completion = Promise.all([fence.completion, cancelQ1RejectedBody(upstreamFetch, signal)])
    .then(results => results.every(Boolean));
  fence.completion = completion;
  void completion.then(settled => {
    if (settled && q1CleanupFences.get(clientId) === fence && fence.completion === completion) q1CleanupFences.delete(clientId);
    // Active clients retain uncertainty. Only confirmed-gone clients can be
    // pruned, so opening/closing windows does not retain failure entries forever.
    void pruneQ1CleanupFences();
  });
  return completion.then(settled => settled ? waitForQ1CleanupFence(clientId) : false);
}

async function pruneQ1CleanupFences() {
  for (const clientId of new Set([...q1CleanupFences.keys(), ...q1RetiredThrough.keys()])) {
    const fence = q1CleanupFences.get(clientId);
    try {
      const client = await self.clients.get(clientId);
      if (!client) {
        if (q1CleanupFences.get(clientId) === fence) q1CleanupFences.delete(clientId);
        q1RetiredThrough.delete(clientId);
      }
    } catch (_) { /* An unavailable client lookup is not proof of teardown. */ }
  }
}

function cancelQ1RejectedBody(upstreamFetch, signal) {
  // A rejected body is never consumed or replayed until cancellation settles.
  // Abort and listener release request termination; neither proves resources
  // were released when cancellation rejects or exceeds this separate wall.
  return new Promise(resolve => {
    let finished = false;
    const finish = settled => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', interrupted);
      if (!settled) upstreamFetch.abort();
      let confirmed = settled;
      try { upstreamFetch.release(); } catch (_) { confirmed = false; upstreamFetch.abort(); }
      resolve(confirmed);
    };
    const interrupted = () => upstreamFetch.abort();
    const timer = setTimeout(() => finish(false), Q1_REJECTED_BODY_CLEANUP_TIMEOUT_MS);
    signal?.addEventListener('abort', interrupted, { once: true });
    // Observe late rejection too. A timeout cannot make its late settlement
    // authorize a refresh or retry, and no reader lock is acquired here.
    let cancellation;
    try { cancellation = upstreamFetch.response.body?.cancel(); } catch (_) { finish(false); }
    Promise.resolve(cancellation).then(() => finish(true), () => finish(false));
    if (signal?.aborted) interrupted();
  });
}

async function fetchMediaWithHeadersDeadline(url, options, requestSignal) {
  requestSignal?.throwIfAborted();
  const controller = new AbortController();
  let timedOut = false;
  let headersReceived = false;
  const abortForCaller = () => controller.abort(requestSignal?.reason);
  requestSignal?.addEventListener('abort', abortForCaller, { once: true });
  const timeout = setTimeout(() => {
    if (controller.signal.aborted || requestSignal?.aborted) return;
    timedOut = true;
    controller.abort();
  }, MEDIA_HEADERS_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    headersReceived = true;
    let released = false;
    return {
      response,
      abort(reason) {
        if (!controller.signal.aborted) controller.abort(reason);
      },
      release() {
        if (released) return;
        released = true;
        requestSignal?.removeEventListener('abort', abortForCaller);
      }
    };
  } catch (error) {
    if (timedOut && !requestSignal?.aborted) {
      const timeoutError = new Error('Media response headers timeout');
      timeoutError.name = 'MediaHeadersTimeoutError';
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    // A successful fetch resolves at headers, while its body is still live.
    // Keep caller cancellation linked through that body lifetime; the once
    // listener and request-scoped signal are collectable with the fetch.
    if (!headersReceived) requestSignal?.removeEventListener('abort', abortForCaller);
  }
}

function normalizeMediaTraceId(value) {
  const traceId = String(value || '');
  return /^[A-Za-z0-9._-]{1,80}$/.test(traceId) ? traceId : '';
}

function createQ1BodyCancellation(owner, reader, upstreamFetch, terminal) {
  let cancellation;
  return reason => {
    if (cancellation) return cancellation;
    owner.retiring = true;
    terminal();
    cancellation = fenceQ1RejectedBody(owner.clientId, {
      response: { body: { cancel: () => reader.cancel(reason) } },
      abort: () => upstreamFetch?.abort?.(reason),
      release() { upstreamFetch?.release?.(); reader.releaseLock?.(); }
    }).then(settled => {
      owner.complete(settled);
      if (!settled) throw new Error('Q1_REMOTE_CLEANUP_UNCONFIRMED');
    });
    return cancellation;
  };
}

function finalizeMediaResponseBody(body, upstreamFetch, owner = null) {
  if (!body || typeof body.getReader !== 'function') {
    upstreamFetch?.release?.();
    return body;
  }
  const reader = body.getReader();
  let settled = false;
  let downstream;
  const settle = () => {
    if (settled) return false;
    settled = true;
    upstreamFetch?.release?.();
    try { reader.releaseLock?.(); return true; } catch (_) { return false; }
  };
  if (owner) owner.cancelBody = createQ1BodyCancellation(owner, reader, upstreamFetch, () => {
    settled = true;
    try { downstream.error(new DOMException('Q1 transport retired', 'AbortError')); } catch (_) {}
  });
  return new ReadableStream({
    start(controller) { downstream = controller; },
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (settled) return;
        if (done) {
          const released = settle();
          if (owner && !owner.retiring) owner.complete(released);
          controller.close();
          return;
        }
        controller.enqueue(value);
      } catch (error) {
        if (!settled) {
          const released = settle();
          if (owner && !owner.retiring) owner.complete(released);
          controller.error(error);
        }
      }
    },
    async cancel(reason) {
      if (settled) return;
      if (owner) return owner.cancelBody(reason);
      upstreamFetch?.abort?.(reason);
      try { await reader.cancel(reason); } catch (_) {}
      settle();
    }
  }, { highWaterMark: 0 });
}

function instrumentMediaResponseBody(body, context, details = {}, upstreamFetch = null, requestSignal = null, owner = null) {
  if (!body || typeof body.getReader !== 'function') {
    upstreamFetch?.release?.();
    return body;
  }
  const reader = body.getReader();
  const totalBytes = Number(details.totalBytes) || 0;
  let received = 0;
  let firstByteSeen = false;
  let progressDeadline = null;
  let lastProgressBytes = 0;
  let lastProgressAt = Date.now();
  let terminalWinner = '';
  let terminalError = null;
  let terminalNotificationPromise = null;
  let downstream;

  const clearProgressDeadline = () => {
    const deadline = progressDeadline;
    if (!deadline) return;
    progressDeadline = null;
    clearTimeout(deadline.timerId);
    deadline.resolve(null);
  };
  const releaseReaderLock = () => {
    try { reader.releaseLock?.(); return true; } catch (_) { return false; }
  };
  const claimTerminal = (winner, releaseLock = true) => {
    if (terminalWinner) return false;
    terminalWinner = winner;
    clearProgressDeadline();
    upstreamFetch?.release?.();
    const lockReleased = !releaseLock || releaseReaderLock();
    if (owner && !owner.retiring && ['body-complete', 'body-error', 'request-cancelled'].includes(winner)) owner.complete(lockReleased);
    return true;
  };
  if (owner) owner.cancelBody = createQ1BodyCancellation(owner, reader, upstreamFetch,
    () => {
      claimTerminal('consumer-cancelled', false);
      try { downstream.error(new DOMException('Q1 transport retired', 'AbortError')); } catch (_) {}
    });
  const armProgressDeadline = () => {
    if (terminalWinner || progressDeadline) return progressDeadline;
    const firstByteWait = !firstByteSeen;
    const timeoutMs = firstByteWait
      ? MEDIA_FIRST_BYTE_TIMEOUT_MS
      : MEDIA_BODY_NO_PROGRESS_TIMEOUT_MS;
    const winner = firstByteWait ? 'first-byte-timeout' : 'body-no-progress';
    const errorName = firstByteWait ? 'MediaFirstByteTimeoutError' : 'MediaBodyNoProgressError';
    const errorMessage = firstByteWait
      ? 'Media response first byte timeout'
      : 'Media response body made no progress';
    const driveReason = firstByteWait ? 'firstByteTimeout' : 'bodyNoProgress';
    let resolveDeadline;
    const completion = new Promise((resolve) => {
      resolveDeadline = resolve;
    });
    const deadline = {
      completion,
      resolve: resolveDeadline,
      timerId: null
    };
    deadline.timerId = setTimeout(() => {
      if (progressDeadline !== deadline || terminalWinner) return;
      if (requestSignal?.aborted) return;
      clearTimeout(deadline.timerId);
      deadline.timerId = null;
      progressDeadline = null;
      const timeoutError = new Error(errorMessage);
      timeoutError.name = errorName;
      if (!claimTerminal(winner, false)) {
        deadline.resolve(null);
        return;
      }
      terminalError = timeoutError;
      notifyMediaTrace(context, winner, {
        ...details,
        bytes: received,
        totalBytes,
        status: 504,
        reason: winner,
        terminal: true
      });
      terminalNotificationPromise = notifyMediaError(context, 504, [], 0, {
        category: 'timeout',
        driveReason,
        rangeSatisfied: false
      });
      void terminalNotificationPromise.then(
        () => deadline.resolve(timeoutError),
        () => deadline.resolve(timeoutError)
      );
      if (owner) owner.retire();
      else upstreamFetch?.abort?.(timeoutError);
    }, timeoutMs);
    progressDeadline = deadline;
    return deadline;
  };
  const failBodyLength = async (controller, actualBytes) => {
    const lengthError = new Error('Drive media body length mismatch');
    lengthError.name = 'MediaBodyLengthError';
    if (claimTerminal('body-length-error', !owner)) {
      notifyMediaTrace(context, 'body-error', {
        ...details,
        bytes: actualBytes,
        totalBytes,
        reason: 'body-length-mismatch',
        terminal: true
      });
      await notifyMediaError(context, 0, [], 0, {
        category: 'network',
        driveReason: 'bodyLengthMismatch',
        rangeSatisfied: false
      });
      if (owner) owner.retire();
      else upstreamFetch?.abort?.(lengthError);
    }
    controller.error(lengthError);
  };
  return new ReadableStream({
    start(controller) { downstream = controller; },
    async pull(controller) {
      if (terminalWinner) return;
      const deadline = armProgressDeadline();
      const deadlineResult = deadline.completion.then((error) => {
        if (error) throw error;
        return null;
      });
      try {
        while (!terminalWinner) {
          const pendingRead = reader.read();
          const readResult = await Promise.race([pendingRead, deadlineResult]);
          if (terminalWinner) {
            if (!owner?.retiring) releaseReaderLock();
            if (terminalWinner === 'first-byte-timeout' || terminalWinner === 'body-no-progress') {
              await terminalNotificationPromise;
              controller.error(terminalError);
            }
            return;
          }
          if (!readResult) return;
          const { done, value } = readResult;
          if (done) {
            if (details.rangeSatisfied === true && totalBytes > 0 && received !== totalBytes) {
              await failBodyLength(controller, received);
              return;
            }
            if (claimTerminal('body-complete')) {
              notifyMediaTrace(context, 'body-complete', {
                ...details, bytes: received, totalBytes, terminal: false
              });
            }
            controller.close();
            return;
          }
          const byteLength = Number(value?.byteLength) || 0;
          if (byteLength <= 0) continue;
          clearProgressDeadline();
          const nextReceived = received + byteLength;
          if (details.rangeSatisfied === true && totalBytes > 0 && nextReceived > totalBytes) {
            await failBodyLength(controller, nextReceived);
            return;
          }
          received = nextReceived;
          if (!firstByteSeen) {
            firstByteSeen = true;
            lastProgressAt = Date.now();
            void notifyMediaProgress(context, 'first-byte', {
              ...details, bytes: received, totalBytes
            });
            notifyMediaTrace(context, 'first-byte', {
              ...details, bytes: received, totalBytes
            });
          }
          const now = Date.now();
          if (
            received - lastProgressBytes >= 1024 * 1024
            || now - lastProgressAt >= MEDIA_TRACE_PROGRESS_INTERVAL_MS
            || (totalBytes > 0 && received >= totalBytes)
          ) {
            lastProgressBytes = received;
            lastProgressAt = now;
            notifyMediaTrace(context, 'body-progress', {
              ...details, bytes: received, totalBytes
            });
          }
          controller.enqueue(value);
          return;
        }
      } catch (error) {
        if (terminalWinner) {
          if (!owner?.retiring) releaseReaderLock();
          if (terminalWinner === 'first-byte-timeout' || terminalWinner === 'body-no-progress') {
            await terminalNotificationPromise;
            controller.error(terminalError || error);
          }
          return;
        }
        const callerCancelled = requestSignal?.aborted || error?.name === 'AbortError';
        if (claimTerminal(callerCancelled ? 'request-cancelled' : 'body-error')) {
          notifyMediaTrace(context,
            callerCancelled ? 'request-cancelled' : 'body-error', {
              ...details,
              bytes: received,
              totalBytes,
              reason: callerCancelled ? 'body-aborted' : 'body-read-failed',
              terminal: true
            });
        }
        controller.error(error);
      }
    },
    async cancel(reason) {
      if (owner) return owner.cancelBody(reason);
      const shouldTrace = claimTerminal('consumer-cancelled', false);
      if (!shouldTrace) {
        if (terminalWinner === 'first-byte-timeout' || terminalWinner === 'body-no-progress') {
          await terminalNotificationPromise;
          try { await reader.cancel(reason); } catch (_) {}
          releaseReaderLock();
        }
        return;
      }
      upstreamFetch?.abort?.(reason);
      try { await reader.cancel(reason); } catch (_) {}
      releaseReaderLock();
      notifyMediaTrace(context, 'request-cancelled', {
        ...details,
        bytes: received,
        totalBytes,
        reason: 'consumer-cancelled',
        terminal: true
      });
    }
  }, { highWaterMark: 0 });
}

function mediaErrorResponse(message, status) {
  return new Response(message, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}

function extractFileId(pathname) {
  const parts = pathname.split(MEDIA_MARKER);
  if (parts.length < 2) return null;
  const trailing = parts[1];
  const slash = trailing.indexOf('/');
  return slash === -1 ? trailing : trailing.slice(0, slash);
}

function normalizeCredential(data) {
  const account = typeof data?.account === 'string' ? data.account : '';
  const revision = data?.revision;
  const accountGeneration = data?.accountGeneration;
  const expiresAt = data?.expiresAt;
  if (data?.credentialProtocol !== AUTH_PROTOCOL) return null;
  if (typeof data?.token !== 'string' || !data.token || data.token.length > 16_384) return null;
  if (!Number.isFinite(expiresAt)) return null;
  if (!account || account.length > 256 || /[\s\x00-\x1f\x7f]/.test(account)) return null;
  if (!Number.isSafeInteger(revision) || revision < 1) return null;
  if (!Number.isSafeInteger(accountGeneration) || accountGeneration < 0) return null;
  return { token: data.token, expiresAt, account, revision, accountGeneration };
}

function isUsableCredential(data) {
  return Boolean(data?.token) && Date.now() < Number(data.expiresAt) - 30_000;
}

function credentialMatchesContext(credential, context) {
  return Boolean(credential)
    && credential.accountGeneration === context.accountGeneration
    && (!context.expectedAccount || credential.account === context.expectedAccount);
}

function sameCredential(left, right) {
  return Boolean(left && right)
    && left.accountGeneration === right.accountGeneration
    && left.account === right.account
    && left.revision === right.revision
    && left.token === right.token;
}

function shouldAcceptCredential(current, next) {
  if (!current) return true;
  if (next.accountGeneration !== current.accountGeneration) {
    return next.accountGeneration > current.accountGeneration;
  }
  if (next.account !== current.account) return false;
  if (next.revision !== current.revision) return next.revision > current.revision;
  return next.token === current.token && next.expiresAt >= current.expiresAt;
}

function isValidClearMessage(data) {
  const generation = data?.accountGeneration;
  const revision = data?.revision;
  return data?.credentialProtocol === AUTH_PROTOCOL
    && Number.isSafeInteger(generation)
    && generation >= 0
    && typeof data.account === 'string'
    && Boolean(data.account)
    && Number.isSafeInteger(revision)
    && revision >= 1;
}

function clearMatchesCredential(data, current) {
  return isValidClearMessage(data)
    && data.accountGeneration === current.accountGeneration
    && data.account === current.account
    && data.revision >= current.revision;
}

async function getUsableCredential(context, {
  forceRefresh = false,
  rejectedRevision = null,
  expectedAccount = null,
  signal
} = {}) {
  const cached = clientCredentials.get(context.clientId);
  const scopedContext = { ...context, expectedAccount: expectedAccount || context.expectedAccount || null };
  if (!context.requireCurrentMedia && !forceRefresh && credentialMatchesContext(cached, scopedContext) && isUsableCredential(cached)) return cached;
  return requestTokenFromClient(scopedContext, { forceRefresh, rejectedRevision, signal });
}

async function requestTokenFromClient(context, { forceRefresh, rejectedRevision = null, signal }) {
  signal?.throwIfAborted();
  const client = context.clientId ? await self.clients.get(context.clientId) : null;
  signal?.throwIfAborted();
  if (!client) return null;
  const requestId = `token-${++requestSequence}`;
  return new Promise((resolve, reject) => {
    let resolved = false;
    const channel = new MessageChannel();
    const finish = (data) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);
      signal?.removeEventListener('abort', onAbort);
      tokenRequests.delete(requestId);
      channel.port1.close();
      channel.port2.close();
      // SET_TOKEN updates the shared account cache, not this media lease. An
      // owner-required request needs an affirmative reply for its exact id.
      const received = normalizeCredential(data);
      if (context.requireCurrentMedia && data?.requestCurrent === true
        && data.q1RetirementProtocol !== Q1_RETIRE_PROTOCOL && received && credentialMatchesContext(received, context)) {
        const error = new Error('Q1 client upgrade required'); error.name = 'Q1ClientUpgradeRequiredError';
        reject(error); return;
      }
      if (context.requireCurrentMedia && (data?.requestCurrent !== true
        || data.q1RetirementProtocol !== Q1_RETIRE_PROTOCOL)) { resolve(null); return; }
      if (received && credentialMatchesContext(received, context)
        && (!Number.isSafeInteger(rejectedRevision) || received.revision > rejectedRevision)) {
        const current = clientCredentials.get(context.clientId);
        if (shouldAcceptCredential(current, received)) clientCredentials.set(context.clientId, received);
      }
      const accepted = clientCredentials.get(context.clientId);
      resolve(credentialMatchesContext(accepted, context)
        && isUsableCredential(accepted)
        && (!Number.isSafeInteger(rejectedRevision) || accepted.revision > rejectedRevision)
        ? accepted
        : null);
    };
    const respond = (data) => {
      if (data?.type === 'TOKEN_RESPONSE' && data.requestId === requestId) finish(data);
    };
    const onAbort = () => finish(null);
    const timeout = setTimeout(() => finish(null), CREDENTIAL_REQUEST_TIMEOUT_MS);
    tokenRequests.set(requestId, {
      clientId: context.clientId,
      accountGeneration: context.accountGeneration,
      expectedAccount: context.expectedAccount || null,
      finish,
      respond
    });
    channel.port1.onmessage = (event) => respond(event.data);
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
      client.postMessage({
        type: 'TOKEN_REQUEST', requestId, forceRefresh,
        clientId: context.clientId,
        fileId: context.fileId,
        requireCurrentMedia: context.requireCurrentMedia === true,
        mediaSession: context.sessionId,
        sourceGeneration: context.sourceGeneration,
        accountGeneration: context.accountGeneration,
        expectedAccount: context.expectedAccount || null,
        rejectedRevision: Number.isSafeInteger(rejectedRevision) ? rejectedRevision : null
      }, [channel.port2]);
    } catch (_) {
      finish(null);
    }
  });
}

function parseRetryAfterMs(value, now = Date.now()) {
  const raw = String(value || '').trim();
  if (!raw) return 0;
  if (/^\d+$/.test(raw)) return Math.max(0, Number(raw) * 1000);
  const retryAt = Date.parse(raw);
  return Number.isFinite(retryAt) ? Math.max(0, retryAt - Number(now || 0)) : 0;
}

function parseRequestedByteRange(value) {
  const match = /^bytes=(\d*)-(\d*)$/i.exec(String(value || '').trim());
  if (!match || (!match[1] && !match[2])) return null;
  const start = match[1] ? Number(match[1]) : null;
  const end = match[2] ? Number(match[2]) : null;
  if ((start != null && !Number.isSafeInteger(start))
    || (end != null && !Number.isSafeInteger(end))
    || (start == null && end === 0)
    || (start != null && end != null && (start > end
      || !Number.isSafeInteger(end - start + 1)))) return null;
  return start == null ? { suffixLength: end } : { start, end };
}

function parseSatisfiedContentRange(value) {
  const match = /^bytes\s+(\d+)-(\d+)\/(\d+|\*)$/i.exec(String(value || '').trim());
  if (!match) return null;
  const start = Number(match[1]);
  const end = Number(match[2]);
  const total = match[3] === '*' ? null : Number(match[3]);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end
    || (total != null && (!Number.isSafeInteger(total) || total <= end))) return null;
  return { start, end, total };
}

function parsePositiveSafeInteger(value) {
  const raw = String(value ?? '').trim();
  if (!/^\d+$/.test(raw)) return null;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function inferContentRangeFromLength(requestedValue, totalValue, lengthValue) {
  const requested = parseRequestedByteRange(requestedValue);
  const total = parsePositiveSafeInteger(totalValue);
  const length = parsePositiveSafeInteger(lengthValue);
  if (!requested || !total || !length) return null;

  let start;
  let end;
  let expectedLength;
  if (requested.suffixLength != null) {
    expectedLength = Math.min(requested.suffixLength, total);
    if (!expectedLength) return null;
    start = total - expectedLength;
    end = total - 1;
  } else {
    start = requested.start;
    if (start >= total) return null;
    end = requested.end == null
      ? total - 1
      : Math.min(requested.end, total - 1);
    expectedLength = end - start + 1;
  }

  // Without an exposed Content-Range, only an exact full-span length proves
  // both response endpoints. A shorter 206 may still be valid HTTP, but its
  // omitted interval cannot be reconstructed safely from length alone.
  if (length !== expectedLength) return null;

  return `bytes ${start}-${end}/${total}`;
}

function doesContentRangeSatisfy(requestedValue, contentValue) {
  const requested = parseRequestedByteRange(requestedValue);
  const content = parseSatisfiedContentRange(contentValue);
  if (!requested || !content) return false;
  if (requested.suffixLength != null) {
    if (!requested.suffixLength || content.total == null) return false;
    const earliestStart = Math.max(0, content.total - requested.suffixLength);
    return content.start >= earliestStart && content.end === content.total - 1;
  }
  if (content.start !== requested.start) return false;
  if (requested.end != null) {
    const latestEnd = content.total == null
      ? requested.end
      : Math.min(requested.end, content.total - 1);
    return content.end <= latestEnd;
  }
  return true;
}

async function notifyMediaStatus(context, details) {
  if (!context.clientId) return;
  try {
    const client = await self.clients.get(context.clientId);
    client?.postMessage({
      type: 'MEDIA_PROXY_STATUS',
      requestId: context.requestId,
      fileId: context.fileId,
      sessionId: context.sessionId,
      mediaSession: context.mediaSession,
      ...(Number.isSafeInteger(context.sourceGeneration)
        ? { sourceGeneration: context.sourceGeneration }
        : {}),
      status: details.status,
      requestedRange: context.requestedRange || null,
      contentRange: details.contentRange || null,
      contentRangeInferred: Boolean(details.contentRangeInferred),
      rangeSatisfied: Boolean(details.rangeSatisfied),
      playbackMode: details.playbackMode
    });
  } catch (_) {
    // Closing a client must not turn its media response into another error.
  }
}

async function notifyMediaProgress(context, stage, details = {}) {
  if (!context.clientId) return;
  try {
    const client = await self.clients.get(context.clientId);
    client?.postMessage({
      type: 'MEDIA_PROXY_PROGRESS',
      requestId: context.requestId,
      fileId: context.fileId,
      sessionId: context.sessionId,
      mediaSession: context.mediaSession,
      ...(Number.isSafeInteger(context.sourceGeneration)
        ? { sourceGeneration: context.sourceGeneration }
        : {}),
      stage: String(stage || ''),
      status: Number(details.status) || 0,
      requestedRange: context.requestedRange || null,
      rangeSatisfied: details.rangeSatisfied === true,
      playbackMode: String(details.playbackMode || ''),
      bytes: Number(details.bytes) || 0,
      totalBytes: Number(details.totalBytes) || 0
    });
  } catch (_) {
    // Closing a client must not turn its media response into another error.
  }
}

function notifyMediaTrace(context, stage, details = {}) {
  if (!context.clientId || !context.traceId) return;
  const message = {
    type: 'MEDIA_TRACE_EVENT',
    traceId: context.traceId,
    requestId: context.requestId,
    sessionId: context.sessionId,
    mediaSession: context.mediaSession,
    sequence: ++mediaTraceSequence,
    at: Date.now(),
    stage: String(stage || 'unknown'),
    requestedRange: context.requestedRange || null
  };
  const allowed = [
    'attempt', 'status', 'bytes', 'totalBytes', 'rangeSatisfied',
    'playbackMode', 'reason', 'terminal'
  ];
  for (const key of allowed) {
    const value = details[key];
    if (value == null) continue;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      message[key] = value;
    }
  }
  const queueKey = context.requestId;
  const prior = mediaTraceDeliveryQueues.get(queueKey) || Promise.resolve();
  const delivery = prior.catch(() => {}).then(async () => {
    try {
      const client = await self.clients.get(context.clientId);
      client?.postMessage(message);
    } catch (_) {
      // Diagnostics must never alter the media response.
    }
  });
  mediaTraceDeliveryQueues.set(queueKey, delivery);
  void delivery.finally(() => {
    if (mediaTraceDeliveryQueues.get(queueKey) === delivery) mediaTraceDeliveryQueues.delete(queueKey);
  }).catch(() => {});
}

async function notifyMediaError(context, status, reasons = [], retryAfterMs = 0, details = {}) {
  if (!context.clientId) return;
  const rateLimited = status === 429
    || (status === 403 && reasons.some((reason) => /rateLimitExceeded/i.test(reason)));
  const category = details.category || (status === 401 ? 'auth'
    : rateLimited ? 'rate-limit'
    : status === 403 ? 'permission'
    : status === 404 ? 'not-found'
    : status >= 500 ? 'server' : 'http');
  try {
    const client = await self.clients.get(context.clientId);
    client?.postMessage({
      type: 'MEDIA_PROXY_ERROR',
      ...context,
      status,
      category,
      reasons,
      driveReason: details.driveReason || reasons[0] || null,
      requestedRange: context.requestedRange || null,
      contentRange: details.contentRange || null,
      contentRangeInferred: Boolean(details.contentRangeInferred),
      rangeSatisfied: Boolean(details.rangeSatisfied),
      rejectedRevision: Number.isSafeInteger(details.rejectedRevision) ? details.rejectedRevision : null,
      retryAfterMs,
      sessionId: context.sessionId
    });
  } catch (_) {
    // Closing a client must not turn its media response into another error.
  }
}
