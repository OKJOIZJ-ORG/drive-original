const VERSION = '1.2.0';
const SHELL_CACHE = `drive-original-shell-${VERSION}`;
const MEDIA_MARKER = '/__drive_media/';
const SHELL_FILES = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './version.json',
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

  // 2. Stream proxy for Drive media
  if (url.origin === self.location.origin && url.pathname.includes(MEDIA_MARKER)) {
    event.respondWith(proxyDriveMedia(event.request, url));
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
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }

  const driveUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`;
  const headers = new Headers();
  headers.set('Authorization', `Bearer ${token}`);

  const range = request.headers.get('range');
  if (range) {
    headers.set('Range', range);
  }

  try {
    const upstream = await fetch(driveUrl, {
      method: request.method,
      headers,
      redirect: 'follow',
      mode: 'cors'
    });

    const responseHeaders = new Headers(upstream.headers);
    responseHeaders.set('Access-Control-Allow-Origin', self.location.origin);
    responseHeaders.set('Access-Control-Allow-Credentials', 'true');
    responseHeaders.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    responseHeaders.set('Access-Control-Allow-Headers', 'Range, Authorization, Accept, Origin, Content-Type');
    responseHeaders.set('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length, Content-Type');
    responseHeaders.set('Accept-Ranges', 'bytes');
    responseHeaders.set('Cache-Control', 'private, no-transform, max-age=3600');

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders
    });
  } catch (error) {
    return new Response(`Streaming error: ${error?.message || 'unknown'}`, {
      status: 502,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
}

function extractFileId(pathname) {
  const parts = pathname.split(MEDIA_MARKER);
  if (parts.length < 2) return null;
  const trailing = parts[1];
  const slash = trailing.indexOf('/');
  return slash === -1 ? trailing : trailing.slice(0, slash);
}

async function getUsableToken() {
  if (accessToken && tokenExpiresAt && Date.now() < tokenExpiresAt - 30_000) {
    return accessToken;
  }
  const clientToken = await requestTokenFromClient();
  if (clientToken) {
    accessToken = clientToken.token;
    tokenExpiresAt = Number(clientToken.expiresAt) || 0;
    return accessToken;
  }
  return null;
}

async function requestTokenFromClient() {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  if (!clients.length) return null;
  return new Promise((resolve) => {
    let resolved = false;
    const channel = new MessageChannel();
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve(null);
      }
    }, 1500);

    channel.port1.onmessage = (event) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        const data = event.data || {};
        if (data.token) resolve(data);
        else resolve(null);
      }
    };

    clients[0].postMessage({ type: 'REQUEST_TOKEN' }, [channel.port2]);
  });
}

async function notifyClients(message) {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of clients) {
    client.postMessage(message);
  }
}
