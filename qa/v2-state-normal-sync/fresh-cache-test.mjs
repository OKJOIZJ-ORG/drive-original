import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { getEventListeners } from 'node:events';
import { buildFreshCacheFactory } from './fresh-cache-build.mjs';
import { freshCacheRuntime } from './fresh-cache-runtime.mjs';

const built = await buildFreshCacheFactory();
const writer = 'drive-original-account-state-v2-';
const files = [
  { id: 'legacy', name: 'drive-original-account-state.json', modifiedTime: '1', raw: { updatedAt: 1, viewed: { old: 5 }, favorites: { removed: true } } },
  { id: 'a', name: `${writer}device-a.json`, modifiedTime: '2', raw: { schemaVersion: 1, updatedAt: 20, viewed: { recent: 10 }, favorites: { removed: { liked: false, updatedAt: 20 } } } },
  { id: 'b', name: `${writer}device-b.json`, modifiedTime: '3', raw: { schemaVersion: 1, updatedAt: 20, viewed: { recent: 30 }, favorites: { removed: { liked: true, updatedAt: 20 }, added: { liked: true, updatedAt: 10 } } } },
];
const response = (value, status = 200) => new Response(JSON.stringify(value), { status });
function provider({ rows = files, hook } = {}) {
  const calls = [];
  const read = async (address, options) => {
    const url = new URL(address); calls.push({ url, options });
    assert.equal(options.method, 'GET'); assert.equal(options.headers, undefined); assert.equal(options.body, undefined);
    assert.equal(options.credentials, 'omit'); assert.equal(options.redirect, 'error');
    const changed = await hook?.(url, options); if (changed !== undefined) return changed;
    if (url.pathname.endsWith('/about')) return response({ user: { permissionId: 'same-account' } });
    if (url.pathname === '/drive/v3/files') {
      const next = url.searchParams.get('pageToken');
      return response({ files: (next ? rows.slice(2) : rows.slice(0, 2)).map(({ raw, ...meta }) => meta), ...(next || rows.length <= 2 ? {} : { nextPageToken: 'next' }) });
    }
    const row = rows.find(row => row.id === url.pathname.split('/').pop());
    return row ? response(row.raw) : response({}, 404);
  };
  return { calls, read };
}
function factory() {
  const traps = [];
  const context = { URL, URLSearchParams, AbortController, TextDecoder, Blob, DOMException, Headers, performance, setTimeout, clearTimeout,
    console: { warn() {}, log() {}, error() {} },
    localStorage: { getItem() { traps.push('actual-storage'); throw Error('actual storage'); }, setItem() { traps.push('actual-storage'); throw Error('actual storage'); } },
    window: { addEventListener() { traps.push('actual-window'); } }, document: { querySelectorAll() { traps.push('actual-document'); return []; } },
    navigator: { serviceWorker: { controller: {} } }, fetch() { traps.push('ambient-fetch'); throw Error('ambient fetch'); } };
  vm.createContext(context);
  return { make: vm.runInContext(`(${built.source})`, context), traps, context };
}
const deps = read => ({ read, expectedAccountId: 'same-account', isCurrent: () => true });
const plain = value => JSON.parse(JSON.stringify(value));

test('deterministic factory embeds byte-identical complete app source and isolates real globals/storage/timers', async () => {
  assert.equal((await buildFreshCacheFactory()).source, built.source);
  assert.equal(built.appHash, createHash('sha256').update(built.appText).digest('hex'));
  assert.ok(built.source.includes(built.appText));
  const native = provider(); const f = factory(); const before = Object.keys(f.context);
  const job = f.make(deps(native.read)); const result = await job.run();
  assert.equal(result.passed, true); assert.equal(result.writes, 0); assert.equal(result.timersCleared, true);
  assert.equal(job.sourceHash, built.appHash); assert.deepEqual(f.traps, []); assert.deepEqual(Object.keys(f.context), before);
  assert.equal(native.calls.length, 6); assert.equal(result.documents, 3);
  const projection = plain(job.readPrivateProjection());
  assert.deepEqual(projection.viewed, { old: 5, recent: 30 });
  assert.equal(projection.favorites.removed.liked, false); assert.equal(projection.favorites.added.liked, true);
  assert.equal(result.liked, 1); assert.equal(result.unliked, 1); assert.equal(result.viewed, 2);
  assert.ok(!JSON.stringify(result).includes('same-account')); assert.ok(!JSON.stringify(result).includes('removed'));
  const comparison = f.make({ ...deps(native.read), expectedProjection: projection }); assert.equal((await comparison.run()).passed, true);
  job.clear(); assert.throws(() => job.readPrivateProjection());
});

test('wrong account, unknown schema, body404, incomplete and duplicate catalog cannot pass as empty reconstruction', async () => {
  for (const kind of ['account', 'schema', 'body404', 'incomplete', 'duplicate', 'malformed']) {
    const rows = structuredClone(files);
    if (kind === 'schema') rows[1].raw.schemaVersion = 999;
    const native = provider({ rows, hook: url => {
      if (kind === 'account' && url.pathname.endsWith('/about')) return response({ user: { permissionId: 'other-account' } });
      if (url.pathname === '/drive/v3/files') {
        if (kind === 'incomplete') return response({ files: [], incompleteSearch: true });
        if (kind === 'duplicate') return response({ files: [rows[0], { ...rows[0], id: 'duplicate' }] });
        if (kind === 'malformed') return response({ unexpected: true });
      }
      if (kind === 'body404' && url.searchParams.get('alt') === 'media') return response({}, 404);
    } });
    const job = factory().make(deps(native.read)); const result = await job.run();
    assert.equal(result.passed, false, kind); assert.equal(result.writes, 0, kind); assert.equal(result.timersCleared, true, kind);
    assert.throws(() => job.readPrivateProjection(), undefined, kind);
  }
});

test('expected same-count/different-ID projection fails; expected private input is frozen before reads', async () => {
  const baseline = factory().make(deps(provider().read)); await baseline.run(); const expected = plain(baseline.readPrivateProjection());
  const wrong = structuredClone(expected); wrong.viewed.different = wrong.viewed.old; delete wrong.viewed.old;
  const mismatch = factory().make({ ...deps(provider().read), expectedProjection: wrong });
  assert.equal((await mismatch.run()).code, 'projection_mismatch');
  const job = factory().make({ ...deps(provider().read), expectedProjection: expected });
  expected.viewed.changed = 123; assert.equal((await job.run()).passed, true);
});

test('owner change after provider/body await and cancellation stop reconstruction with cleanup', async () => {
  for (const kind of ['owner', 'abort', 'body-owner']) {
    let current = true; const aborter = new AbortController();
    const native = provider({ hook: url => {
      if (kind === 'body-owner' && url.searchParams.get('alt') === 'media') return new Response(new ReadableStream({ start(controller) {
        setTimeout(() => { current = false; controller.enqueue(new TextEncoder().encode(JSON.stringify(files.find(file => url.pathname.endsWith('/' + file.id)).raw))); controller.close(); }, 1);
      } }));
      if (url.pathname === '/drive/v3/files') { if (kind === 'owner') current = false; else if (kind === 'abort') aborter.abort(); }
    } });
    const job = factory().make({ ...deps(native.read), signal: aborter.signal, isCurrent: () => current });
    const result = await job.run(); assert.equal(result.code, kind === 'abort' ? 'cancelled' : 'stale_owner');
    assert.equal(result.passed, false); assert.equal(result.timersCleared, true);
    if (kind !== 'body-owner') assert.equal(native.calls.length, 2);
    assert.equal(getEventListeners(aborter.signal, 'abort').length, 0);
  }
  let current = true; const aborter = new AbortController();
  const successful = factory().make({ ...deps(provider().read), isCurrent: () => current, signal: aborter.signal });
  assert.equal((await successful.run()).passed, true); assert.equal(getEventListeners(aborter.signal, 'abort').length, 0);
  current = false; assert.throws(() => successful.readPrivateProjection(), /stale_owner/);
});

test('deadline bounds stalled native read and byte budget bounds consumed response; no auth refresh or retry', async () => {
  const hanging = factory().make({ ...deps(() => new Promise(() => {})), budgetMs: 20 });
  assert.equal((await hanging.run()).code, 'deadline'); assert.equal(hanging.safeSummary().timersCleared, true);
  const huge = factory().make(deps(async () => new Response(' '.repeat(8 * 1024 * 1024 + 1))));
  assert.equal((await huge.run()).code, 'byte_budget');
  const native = provider({ hook: () => response({}, 401) }); const failure = factory().make(deps(native.read));
  assert.equal((await failure.run()).code, 'http_read_failed'); assert.equal(native.calls.length, 1);
});

test('transport blocks mutation, wrong query/origin, generateIds and arbitrary original body before native dispatch', async () => {
  for (const [url, options] of [
    ['https://www.googleapis.com/drive/v3/files/original?alt=media', {}],
    ['https://www.googleapis.com/drive/v3/files/generateIds?count=1&space=appDataFolder&type=files', {}],
    ['https://other.test/drive/v3/about?fields=user(permissionId)', {}],
    ['https://www.googleapis.com/drive/v3/files?spaces=drive', {}],
    ['https://www.googleapis.com/drive/v3/about?fields=user(permissionId)', { method: 'PATCH' }],
  ]) {
    let calls = 0;
    const job = freshCacheRuntime(shadow => ({ initialize: () => shadow.fetch(url, options) }), deps(() => { calls++; }), { appHash: built.appHash });
    const result = await job.run(); assert.equal(result.code, 'invalid_transport'); assert.equal(calls, 0); assert.equal(result.writes, 0);
  }
});
