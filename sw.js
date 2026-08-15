const VERSION = '1.0.8';
const SHELL_CACHE = `drive-original-shell-${VERSION}`;
const MEDIA_MARKER = '/__drive_media/';
const SHELL_FILES = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

let accessToken = null;
let tokenExpiresAt = 0;

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
  if (data.type === 'SET_TOKEN' && typeof data.token === 'string') {
    accessToken = data.token;
    tokenExpiresAt = Number(data.expiresAt) || 0;
  }
  if (data.type === 'CLEAR_TOKEN') {
    accessToken = null;
    tokenExpiresAt = 0;
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

  // 2. Stream proxy
  if (url.origin === self.location.origin && url.pathname.includes(MEDIA_MARKER)) {
    event.respondWith(proxyDriveMedia(event.request, url));
    return;
  }

  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(event.request));
    return;
  }

  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});

async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request);
    const cache = await caches.open(SHELL_CACHE);
    cache.put(request, response.clone());
    return response;
  } catch (_) {
    const cached = await caches.match(request);
    return cached || caches.match('./index.html');
  }
}

async function proxyDriveMedia(request, url) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405 });
  }
  const fileId = extractFileId(url.pathname);
  if (!fileId || !/^[A-Za-z0-9_-]+$/.test(fileId)) {
    return new Response('Invalid Drive file ID', { status: 400 });
  }

  const token = await getUsableToken();
  if (!token) {
    notifyClients({ type: 'MEDIA_AUTH_REQUIRED' });
    return new Response('Google authorization required', {
      status: 401,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }
    });
  }

  const driveUrl = new URL('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(fileId));
  driveUrl.searchParams.set('alt', 'media');
  driveUrl.searchParams.set('supportsAllDrives', 'true');
  driveUrl.searchParams.set('acknowledgeAbuse', 'true');

  const headers = new Headers();
  headers.set('Authorization', `Bearer ${token}`);
  headers.set('Accept', request.headers.get('Accept') || '*/*');
  const range = request.headers.get('Range');
  if (range) headers.set('Range', range);

  const resourceKey = url.searchParams.get('resourceKey');
  if (resourceKey) headers.set('X-Goog-Drive-Resource-Keys', `${fileId}/${resourceKey}`);

  try {
    const upstream = await fetch(driveUrl, {
      method: request.method,
      headers,
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'follow'
    });

    if (upstream.status === 401) {
      accessToken = null;
      tokenExpiresAt = 0;
      notifyClients({ type: 'MEDIA_AUTH_REQUIRED' });
    }

    if (!upstream.ok && upstream.status !== 206) {
      notifyClients({ type: 'MEDIA_PROXY_ERROR', status: upstream.status });
      return upstream;
    }

    const responseHeaders = new Headers(upstream.headers);
    const hintedType = url.searchParams.get('mime');
    if (hintedType && (!responseHeaders.get('Content-Type') || responseHeaders.get('Content-Type') === 'application/octet-stream')) {
      responseHeaders.set('Content-Type', hintedType);
    }
    responseHeaders.set('Accept-Ranges', 'bytes');
    responseHeaders.set('Cache-Control', 'private, no-store, no-cache, max-age=0');
    responseHeaders.set('Pragma', 'no-cache');
    responseHeaders.set('Content-Disposition', 'inline');
    responseHeaders.delete('Set-Cookie');
    normalizeMediaResponseHeaders(
      responseHeaders,
      upstream.status,
      range,
      Number(url.searchParams.get('size')) || 0
    );

    return new Response(request.method === 'HEAD' ? null : upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders
    });
  } catch (error) {
    notifyClients({ type: 'MEDIA_PROXY_ERROR', status: 0, message: String(error) });
    return new Response('Drive media request failed', {
      status: 502,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }
    });
  }
}

function normalizeMediaResponseHeaders(headers, status, requestedRange, totalSize) {
  const contentLength = Number(headers.get('Content-Length')) || 0;
  if (status === 200 && totalSize && !headers.get('Content-Length')) {
    headers.set('Content-Length', String(totalSize));
  }
  if (status !== 206 || headers.get('Content-Range') || !requestedRange || !totalSize) return;

  const match = /^bytes=(\d+)-(\d*)$/i.exec(requestedRange.trim());
  if (!match) return;
  const start = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : null;
  const inferredEnd = contentLength ? start + contentLength - 1 : totalSize - 1;
  const end = Math.min(requestedEnd ?? inferredEnd, totalSize - 1);
  if (Number.isFinite(start) && Number.isFinite(end) && start <= end) {
    headers.set('Content-Range', `bytes ${start}-${end}/${totalSize}`);
    if (!headers.get('Content-Length')) headers.set('Content-Length', String(end - start + 1));
  }
}

function extractFileId(pathname) {
  const markerIndex = pathname.indexOf(MEDIA_MARKER);
  if (markerIndex < 0) return null;
  return decodeURIComponent(pathname.slice(markerIndex + MEDIA_MARKER.length).split('/')[0]);
}

async function getUsableToken() {
  const clockSkew = 15_000;
  if (accessToken && (!tokenExpiresAt || Date.now() < tokenExpiresAt - clockSkew)) return accessToken;
  accessToken = null;
  tokenExpiresAt = 0;
  return requestTokenFromClients();
}

async function requestTokenFromClients() {
  const windowClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of windowClients) {
    const result = await new Promise((resolve) => {
      const channel = new MessageChannel();
      const timeout = setTimeout(() => resolve(null), 1200);
      channel.port1.onmessage = (event) => {
        clearTimeout(timeout);
        resolve(event.data || null);
      };
      client.postMessage({ type: 'TOKEN_REQUEST' }, [channel.port2]);
    });
    if (result && result.token && (!result.expiresAt || Date.now() < result.expiresAt - 15_000)) {
      accessToken = result.token;
      tokenExpiresAt = Number(result.expiresAt) || 0;
      return accessToken;
    }
  }
  return null;
}

async function notifyClients(message) {
  const windowClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  windowClients.forEach((client) => client.postMessage(message));
}
