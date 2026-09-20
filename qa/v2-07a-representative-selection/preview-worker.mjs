import bundleSource from './private-browser-bundle.js';

const ALLOWED_ORIGIN = 'https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev';
const BUNDLE_PATH = '/representative-selector-0d003842d0bff591.js';

function corsHeaders(origin) {
  const headers = new Headers({
    'Cache-Control': 'no-store',
    'Content-Type': 'text/javascript; charset=utf-8',
    'Cross-Origin-Resource-Policy': 'cross-origin',
    'X-Content-Type-Options': 'nosniff'
  });
  if (origin === ALLOWED_ORIGIN) {
    headers.set('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
    headers.set('Vary', 'Origin');
  }
  return headers;
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');
    if (url.pathname !== BUNDLE_PATH || !['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      return new Response('Not found', { status: 404 });
    }
    if (origin !== ALLOWED_ORIGIN) {
      return new Response('Forbidden', { status: 403, headers: { 'Cache-Control': 'no-store' } });
    }
    const headers = corsHeaders(origin);
    if (request.method === 'OPTIONS') {
      headers.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      return new Response(null, { status: 204, headers });
    }
    return new Response(request.method === 'HEAD' ? null : bundleSource, { status: 200, headers });
  }
};
