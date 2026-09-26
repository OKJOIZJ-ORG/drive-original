export const CANDIDATE_ORIGIN = 'https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev';

const NOT_FOUND_HEADERS = Object.freeze({
  'Cache-Control': 'no-store',
  'Content-Length': '0',
  'Content-Type': 'text/plain; charset=utf-8',
  'X-Content-Type-Options': 'nosniff'
});

function notFound() {
  return new Response(null, { status: 404, headers: NOT_FOUND_HEADERS });
}

function isTrustedBundle(bundle) {
  const role = typeof bundle?.role === 'string' ? bundle.role : '';
  return bundle
    && ['root-inventory', 'representative-selector', 'bounded-adapter', 'identity-reconciler', 'mpegts-probe'].includes(role)
    && typeof bundle.path === 'string'
    && /^[a-f0-9]{64}$/.test(bundle.sha256)
    && bundle.path === `/v2-07a/${role}-${bundle.sha256}.js`
    && Number.isSafeInteger(bundle.byteLength)
    && bundle.byteLength > 0
    && typeof bundle.source === 'string'
    && new TextEncoder().encode(bundle.source).byteLength === bundle.byteLength;
}

export function createBundleTransport(bundles) {
  if (!Array.isArray(bundles) || bundles.length > 5 || bundles.some((bundle) => !isTrustedBundle(bundle))) {
    throw new TypeError('An array of generated V2-07A bundles is required');
  }
  const byPath = new Map();
  for (const bundle of bundles) {
    if (byPath.has(bundle.path)) throw new TypeError('Duplicate V2-07A bundle path');
    byPath.set(bundle.path, bundle);
  }

  return function serveBundle(request) {
    const url = new URL(request.url);
    if (
      request.headers.get('Origin') !== CANDIDATE_ORIGIN
      || !['GET', 'HEAD'].includes(request.method)
      || url.search
    ) return notFound();
    const bundle = byPath.get(url.pathname);
    if (!bundle) return notFound();
    const headers = new Headers({
      'Access-Control-Expose-Headers': 'Content-Length, X-Content-Type-Options',
      'Access-Control-Allow-Origin': CANDIDATE_ORIGIN,
      'Cache-Control': 'no-store',
      'Content-Length': String(bundle.byteLength),
      'Content-Type': 'text/javascript; charset=utf-8',
      'Cross-Origin-Resource-Policy': 'cross-origin',
      'Vary': 'Origin',
      'X-Content-Type-Options': 'nosniff'
    });
    return new Response(request.method === 'HEAD' ? null : bundle.source, { status: 200, headers });
  };
}
