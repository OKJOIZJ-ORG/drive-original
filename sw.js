const VERSION = '1.15.0';
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

  // 1. Never cache version.json or any cache-busted update queries
  if (url.origin === self.location.origin && (url.pathname.endsWith('/version.json') || url.searchParams.has('_t'))) {
    event.respondWith(fetch(event.request, { cache: 'no-store' }));
    return;
  }

  // 2. Stream proxy for Drive media
  if (url.origin === self.location.origin && url.pathname.includes(MEDIA_MARKER)) {
    event.respondWith(proxyDriveMedia(event.request, url, event.clientId));
    return;
  }

  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;

  // 3. For all local shell assets (HTML, JS, CSS, icons): Network-First, fallback to Cache!
  event.respondWith(networkFirstAsset(event.request));
});

async function networkFirstAsset(request) {
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(SHELL_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (_) {
    const cached = await caches.match(request);
    if (cached) return cached;
    if (request.mode === 'navigate') {
      const fallback = await caches.match('./index.html');
      if (fallback) return fallback;
    }
    return Response.error();
  }
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
    mediaSession: url.searchParams.get('session')
  };
  const driveUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`;
  const headers = new Headers();

  const resourceKey = url.searchParams.get('resourceKey');
  if (resourceKey) {
    headers.set('X-Goog-Drive-Resource-Keys', `${fileId}/${resourceKey}`);
  }

  const range = request.headers.get('range');
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
      return fetch(driveUrl, {
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
      await notifyMediaError(context, upstream.status, reasons);
      const errorHeaders = new Headers(upstream.headers);
      errorHeaders.set('Cache-Control', 'no-store');
      return new Response(request.method === 'HEAD' ? null : upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: errorHeaders
      });
    }

    const responseHeaders = new Headers(upstream.headers);
    responseHeaders.set('Access-Control-Allow-Origin', self.location.origin);
    responseHeaders.set('Access-Control-Allow-Credentials', 'true');
    responseHeaders.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    responseHeaders.set('Access-Control-Allow-Headers', 'Range, Authorization, Accept, Origin, Content-Type');
    responseHeaders.set('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length, Content-Type');
    responseHeaders.set('Accept-Ranges', 'bytes');
    responseHeaders.set('Cache-Control', 'private, no-store, no-transform');

    // Force exact MIME type if known (prevents Safari application/octet-stream rejection)
    const mimeParam = url.searchParams.get('mime');
    if (mimeParam) {
      responseHeaders.set('Content-Type', mimeParam);
    }

    return new Response(request.method === 'HEAD' ? null : upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders
    });
  } catch (error) {
    if (request.signal.aborted || error?.name === 'AbortError') throw error;
    await notifyMediaError(context, 502);
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

async function notifyMediaError(context, status, reasons = []) {
  if (!context.clientId) return;
  const category = status === 401 ? 'auth'
    : status === 403 ? 'permission'
    : status === 404 ? 'not-found'
    : status === 429 ? 'rate-limit'
    : status >= 500 ? 'server' : 'http';
  try {
    const client = await self.clients.get(context.clientId);
    client?.postMessage({ type: 'MEDIA_PROXY_ERROR', ...context, status, category, reasons });
  } catch (_) {
    // Closing a client must not turn its media response into another error.
  }
}
