'use strict';
const cacheName = 'drive-original-handoff-1.22.0';
// Existing windows keep their active worker until they close naturally. Keep
// previous shell caches and all account state available for local recovery.
self.addEventListener('install', event => {
  event.waitUntil(caches.open(cacheName).then(cache => cache.addAll(['./', './handoff.js'])));
});
self.addEventListener('fetch', event => {
  const scope = new URL(self.registration.scope), url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
  const navigation = event.request.mode === 'navigate';
  if (!navigation && url.pathname !== new URL('handoff.js', scope).pathname) return;
  event.respondWith(fetch(event.request).then(response => {
    if (!response.ok) throw Error('HANDOFF_NETWORK_UNAVAILABLE');
    return response;
  }).catch(async () => {
    const cached = await caches.open(cacheName);
    return await cached.match(navigation ? new URL('./', scope).href : new URL('handoff.js', scope).href)
      || new Response('인터넷에 연결한 뒤 Drive Original을 다시 열어 주세요.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }));
});
