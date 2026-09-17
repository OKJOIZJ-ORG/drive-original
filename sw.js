const VERSION = '1.20.1';
const SHELL_CACHE = `drive-original-shell-${VERSION}`;
const MEDIA_MARKER = '/__drive_media/';
const SHELL_FILES = [
  './',
  './index.html',
  './styles.css',
  './app.js',
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
const clientTokens = new Map();
const tokenRequests = new Map();
let requestSequence = 0;

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
  if (data.type === 'SET_TOKEN' && clientId && isUsableToken(data)) {
    clientTokens.set(clientId, { token: data.token, expiresAt: Number(data.expiresAt) });
  }
  if (data.type === 'CLEAR_TOKEN' && clientId) {
    clientTokens.delete(clientId);
    for (const pending of tokenRequests.values()) {
      if (pending.clientId === clientId) pending.finish(null);
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
  const context = {
    requestId: `media-${++requestSequence}`,
    clientId: clientId || '',
    fileId,
    sessionId: url.searchParams.get('mediaSession') || url.searchParams.get('session'),
    requestedRange: request.headers.get('range')
  };
  // `mediaSession` is retained until all controlled clients have moved to the
  // clearer `sessionId` field.
  context.mediaSession = context.sessionId;
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

  const range = context.requestedRange;
  if (range) {
    headers.set('Range', range);
  }

  try {
    request.signal.throwIfAborted();
    let token = await getUsableToken(context, { signal: request.signal });
    request.signal.throwIfAborted();
    if (!token) {
      await notifyMediaError(context, 401);
      return mediaErrorResponse('Google authorization required', 401);
    }
    const fetchMedia = () => {
      request.signal.throwIfAborted();
      headers.set('Authorization', `Bearer ${token}`);
      return fetch(driveUrl.toString(), {
        method: request.method,
        headers,
        redirect: 'follow',
        mode: 'cors',
        cache: 'no-store',
        signal: request.signal
      });
    };
    let upstream = await fetchMedia();
    if (upstream.status === 401) {
      const rejectedToken = token;
      const cached = clientTokens.get(clientId);
      // Another request may already have refreshed this client's token.
      if (isUsableToken(cached) && cached.token !== rejectedToken) {
        token = cached.token;
      } else {
        clientTokens.delete(clientId);
        token = await getUsableToken(context, { forceRefresh: true, signal: request.signal });
      }
      if (token && token !== rejectedToken) {
        await upstream.body?.cancel();
        upstream = await fetchMedia();
      }
    }

    request.signal.throwIfAborted();
    if (!upstream.ok) {
      if (upstream.status === 401 && clientTokens.get(clientId)?.token === token) {
        clientTokens.delete(clientId);
      }
      let reasons = [];
      try {
        const body = await upstream.clone().json();
        reasons = (body?.error?.errors || []).map((item) => item?.reason).filter(Boolean);
      } catch (_) {}
      const retryAfterMs = parseRetryAfterMs(upstream.headers.get('Retry-After'));
      const contentRange = upstream.headers.get('Content-Range');
      await notifyMediaError(context, upstream.status, reasons, retryAfterMs, {
        category: upstream.status === 416 ? 'range-unsatisfiable' : undefined,
        contentRange,
        rangeSatisfied: false,
        driveReason: reasons[0] || (upstream.status === 416 ? 'rangeNotSatisfiable' : null)
      });
      const errorHeaders = new Headers(upstream.headers);
      errorHeaders.set('Cache-Control', 'no-store');
      return new Response(request.method === 'HEAD' ? null : upstream.body, {
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
    const interval = /^bytes\s+(\d+)-(\d+)\//i.exec(String(contentRange || ''));
    const lengthConsistent = !declaredLength || (interval && /^\d+$/.test(declaredLength)
      && Number.isSafeInteger(Number(declaredLength))
      && Number(declaredLength) === Number(interval[2]) - Number(interval[1]) + 1);
    const rangeSatisfied = upstream.status === 206
      && doesContentRangeSatisfy(range, contentRange) && Boolean(lengthConsistent);
    if (upstream.status === 206 && !rangeSatisfied) {
      await upstream.body?.cancel();
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

    return new Response(request.method === 'HEAD' ? null : upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders
    });
  } catch (error) {
    if (request.signal.aborted || error?.name === 'AbortError') throw error;
    await notifyMediaError(context, 0, [], 0, {
      category: 'network',
      driveReason: 'networkFailure',
      rangeSatisfied: false
    });
    return mediaErrorResponse('Drive streaming request failed', 502);
  }
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

function isUsableToken(data) {
  return typeof data?.token === 'string' && Boolean(data.token)
    && Number.isFinite(Number(data.expiresAt)) && Date.now() < Number(data.expiresAt) - 30_000;
}

async function getUsableToken(context, { forceRefresh = false, signal } = {}) {
  const cached = clientTokens.get(context.clientId);
  if (!forceRefresh && isUsableToken(cached)) return cached.token;
  return requestTokenFromClient(context, { forceRefresh, signal });
}

async function requestTokenFromClient(context, { forceRefresh, signal }) {
  signal?.throwIfAborted();
  const client = context.clientId ? await self.clients.get(context.clientId) : null;
  signal?.throwIfAborted();
  if (!client) return null;
  const requestId = `token-${++requestSequence}`;
  return new Promise((resolve) => {
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
      if (isUsableToken(data)) {
        clientTokens.set(context.clientId, { token: data.token, expiresAt: Number(data.expiresAt) });
        resolve(data.token);
      } else {
        resolve(null);
      }
    };
    const respond = (data) => {
      if (data?.type === 'TOKEN_RESPONSE' && data.requestId === requestId) finish(data);
    };
    const onAbort = () => finish(null);
    const timeout = setTimeout(() => finish(null), forceRefresh ? 12_000 : 1500);
    tokenRequests.set(requestId, { clientId: context.clientId, finish, respond });
    channel.port1.onmessage = (event) => respond(event.data);
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
      client.postMessage({
        type: 'TOKEN_REQUEST', requestId, forceRefresh,
        clientId: context.clientId, fileId: context.fileId
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
    || (start != null && end != null && start > end)) return null;
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
      fileId: context.fileId,
      sessionId: context.sessionId,
      mediaSession: context.mediaSession,
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
      retryAfterMs,
      sessionId: context.sessionId
    });
  } catch (_) {
    // Closing a client must not turn its media response into another error.
  }
}
