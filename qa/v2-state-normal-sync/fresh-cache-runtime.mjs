// No credentials enter this helper. The coordinator owns native GET and the
// real account/auth/token/controller/lifecycle/projection fences in isCurrent.
export function freshCacheRuntime(launch, deps, provenance) {
  const codes = new Set(['stale_owner', 'cancelled', 'deadline', 'read_budget', 'byte_budget', 'catalog_budget', 'invalid_transport', 'wrong_account', 'http_read_failed', 'malformed_json', 'initialization_failed', 'projection_mismatch']);
  const fail = code => Object.assign(new Error(code), { code });
  if (typeof deps?.read !== 'function' || typeof deps?.isCurrent !== 'function' || typeof deps.expectedAccountId !== 'string' || !deps.expectedAccountId) throw fail('invalid_transport');
  const limit = deps.budgetMs ?? 30000;
  if (!Number.isInteger(limit) || limit < 1 || limit > 30000) throw fail('invalid_transport');
  let expectedProjection = deps.expectedProjection === undefined ? undefined : JSON.parse(JSON.stringify(deps.expectedProjection));
  const aborter = new AbortController(); const started = Date.now();
  const externalAbort = () => aborter.abort();
  deps.signal?.addEventListener('abort', externalAbort, { once: true });
  if (deps.signal?.aborted) externalAbort();
  let reads = 0, bytes = 0, pages = 0, done = false, passed = false, failure = null, privateProjection = null;
  let cancelled = false, expired = false, timerSequence = 0;
  const ids = new Set(), timers = new Map(), storage = new Map();
  const deadline = setTimeout(() => { expired = true; aborter.abort(); }, limit);
  const current = () => {
    if (expired || Date.now() - started >= limit) throw fail('deadline');
    if (cancelled || deps.signal?.aborted) throw fail('cancelled');
    if (aborter.signal.aborted || !deps.isCurrent()) throw fail('stale_owner');
  };
  const bounded = async promise => {
    current();
    let listener;
    try {
      return await Promise.race([promise, new Promise((_, reject) => {
        listener = () => reject(fail(expired ? 'deadline' : cancelled || deps.signal?.aborted ? 'cancelled' : 'stale_owner'));
        aborter.signal.addEventListener('abort', listener, { once: true });
        if (aborter.signal.aborted) listener();
      })]);
    } finally { aborter.signal.removeEventListener('abort', listener); }
  };
  const fetchRead = async (address, options = {}) => {
    current();
    const url = new URL(address), keys = [...url.searchParams.keys()].sort().join(',');
    const about = url.pathname === '/drive/v3/about' && keys === 'fields' && url.searchParams.get('fields') === 'user(permissionId)';
    const catalog = url.pathname === '/drive/v3/files' && ['fields,orderBy,pageSize,q,spaces', 'fields,orderBy,pageSize,pageToken,q,spaces'].includes(keys)
      && url.searchParams.get('spaces') === 'appDataFolder' && url.searchParams.get('pageSize') === '1000'
      && url.searchParams.get('orderBy') === 'modifiedTime desc'
      && url.searchParams.get('fields') === 'nextPageToken,incompleteSearch,files(id,name,modifiedTime)'
      && url.searchParams.get('q') === "(name = 'drive-original-account-state.json' or name contains 'drive-original-account-state-v2-') and trashed = false";
    const id = url.pathname.split('/').pop();
    const body = /^\/drive\/v3\/files\/[A-Za-z0-9_-]{1,200}$/.test(url.pathname) && ids.has(id) && keys === 'alt' && url.searchParams.get('alt') === 'media';
    if (url.origin !== 'https://www.googleapis.com' || url.username || url.password || url.hash
      || String(options.method || 'GET').toUpperCase() !== 'GET' || options.body !== undefined || !(about || catalog || body)) throw fail('invalid_transport');
    // The shadow driveFetch's synthetic Authorization never reaches native read.
    if (++reads > 100) throw fail('read_budget');
    if (catalog && ++pages > 16) throw fail('catalog_budget');
    const response = await bounded(Promise.resolve().then(() => deps.read(url.href, { method: 'GET', signal: aborter.signal, cache: 'no-store', redirect: 'error', credentials: 'omit' })));
    current();
    if (!response?.ok) { void response?.body?.cancel?.().catch(() => {}); throw fail('http_read_failed'); }
    if (!response.body?.getReader) throw fail('invalid_transport');
    const reader = response.body.getReader(); const chunks = []; let length = 0;
    try {
      for (;;) {
        const part = await bounded(reader.read()); current();
        if (part.done) break;
        bytes += part.value.byteLength; length += part.value.byteLength;
        if (bytes > 8 * 1024 * 1024) throw fail('byte_budget');
        chunks.push(part.value);
      }
    } catch (error) { void reader.cancel().catch(() => {}); throw error; }
    finally { reader.releaseLock(); }
    const raw = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { raw.set(chunk, offset); offset += chunk.byteLength; }
    let value;
    try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw)); } catch (_) { throw fail('malformed_json'); }
    if (about && value?.user?.permissionId !== deps.expectedAccountId) throw fail('wrong_account');
    if (catalog && Array.isArray(value?.files)) {
      for (const file of value.files) {
        if (file?.name === 'drive-original-account-state.json' || /^drive-original-account-state-v2-[A-Za-z0-9_-]+\.json$/.test(file?.name || '')) {
          if (/^[A-Za-z0-9_-]{1,200}$/.test(file?.id || '')) ids.add(file.id);
        }
      }
      if (ids.size > 64) throw fail('catalog_budget');
    }
    return { ok: true, status: 200, json: async () => { current(); return value; }, body: { cancel: async () => {} } };
  };
  const schedule = (fn, delay) => { const id = ++timerSequence; timers.set(id, { fn, delay }); return id; };
  const location = { href: 'https://fresh-cache-shadow.invalid/', origin: 'https://fresh-cache-shadow.invalid', pathname: '/', search: '', hash: '', protocol: 'https:' };
  const shadow = {
    globalThis: { __DRIVE_ORIGINAL_RUNTIME__: { driveMutationsEnabled: false, accountStateWritesEnabled: false } },
    window: { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }), isSecureContext: true, location, setTimeout: schedule },
    document: { visibilityState: 'visible', addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; } },
    navigator: { onLine: true }, location, history: { state: null, replaceState() {} },
    localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, String(v)), removeItem: k => storage.delete(k), get length() { return storage.size; }, key: i => [...storage.keys()][i] },
    fetch: fetchRead, setTimeout: schedule, clearTimeout: id => timers.delete(id), setInterval: schedule, clearInterval: id => timers.delete(id),
    requestAnimationFrame: fn => schedule(fn, 0), console: { log() {}, warn() {}, error() {} },
  };
  let app;
  const cleanup = () => { clearTimeout(deadline); timers.clear(); deps.signal?.removeEventListener('abort', externalAbort); aborter.abort(); };
  const safeSummary = () => ({ done, passed, code: failure, reads, writes: 0, bytes, documents: passed ? ids.size : 0,
    liked: passed ? Object.values(privateProjection.favorites).filter(entry => entry.liked).length : 0,
    unliked: passed ? Object.values(privateProjection.favorites).filter(entry => !entry.liked).length : 0,
    viewed: passed ? Object.keys(privateProjection.viewed).length : 0,
    emptyStorageStart: true, timersCleared: done && timers.size === 0 });
  let operation;
  return {
    sourceHash: provenance.appHash,
    run() {
      if (operation) return operation;
      operation = (async () => {
        try {
          current(); app = launch(shadow);
          await bounded(app.initialize()); current();
          if (!app.loaded() || app.accountId() !== deps.expectedAccountId || app.failed()) throw fail('initialization_failed');
          const reconstructed = app.projection();
          if (expectedProjection !== undefined && !app.equal(reconstructed, app.validate(expectedProjection))) throw fail('projection_mismatch');
          current(); privateProjection = reconstructed; passed = true;
        } catch (error) { failure = codes.has(error?.code) ? error.code : 'initialization_failed'; }
        finally { done = true; cleanup(); }
        return safeSummary();
      })();
      return operation;
    },
    safeSummary,
    readPrivateProjection() {
      if (!done || !passed || cancelled) throw fail('initialization_failed');
      if (deps.signal?.aborted || !deps.isCurrent()) throw fail('stale_owner');
      return JSON.parse(JSON.stringify(privateProjection));
    },
    clear() { cancelled = true; privateProjection = null; expectedProjection = undefined; app = null; storage.clear(); ids.clear(); passed = false; cleanup(); },
  };
}
