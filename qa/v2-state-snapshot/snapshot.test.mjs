import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { collectSnapshot, compareSnapshots, canonical, validateRawState } from './snapshot.mjs';

// Execute the actual product functions rather than maintaining a QA conflict engine.
const source = fs.readFileSync(new URL('../../app.js', import.meta.url), 'utf8');
const first = source.indexOf('function createEmptyAccountMediaState()');
const last = source.indexOf('function accountFavoriteIds(', first);
assert.ok(first >= 0 && last > first);
const context = vm.createContext({});
vm.runInContext(`const ACCOUNT_STATE_SCHEMA_VERSION = 1;\n${source.slice(first, last)}`, context);
const normalize = input => JSON.parse(JSON.stringify(context.normalizeAccountMediaState(input)));
const merge = (a, b) => JSON.parse(JSON.stringify(context.mergeAccountMediaStates(a, b)));
const rules = { normalize, merge };
const state = (favorites = {}, viewed = {}) => ({ schemaVersion: 1, updatedAt: 20, favorites, viewed });
const metadata = (id, writer = id, revision = '1') => ({ id,
  name: `drive-original-account-state-v2-${writer}.json`, modifiedTime: `2026-09-28T00:00:${revision.padStart(2, '0')}Z`, version: revision });
const seed = () => [
  { ...metadata('legacy'), name: 'drive-original-account-state.json', raw: state({
    a: { liked: true, updatedAt: 10 }, b: true }, { seen: 10 }) },
  { ...metadata('first'), raw: state({ a: { liked: false, updatedAt: 20 } }, { seen: 30, later: 20 }) }
];
function fixture(initial = seed(), hook = () => {}) {
  const files = structuredClone(initial), calls = [];
  let account = 'same-account', lists = 0;
  const read = async (address, options) => {
    const url = new URL(address);
    assert.equal(url.origin, 'https://www.googleapis.com');
    assert.equal(options.method, 'GET');
    assert.ok(options.signal instanceof AbortSignal);
    calls.push(url);
    const reply = (body, status = 200) => new Response(JSON.stringify(body), { status });
    const route = url.pathname.endsWith('/about') ? 'account' : url.searchParams.get('alt') === 'media' ? 'body' : 'catalog';
    await hook({ route, files, url, calls, lists, setAccount: value => { account = value; } });
    if (route === 'account') return reply({ user: { permissionId: account } });
    if (route === 'catalog') {
      lists++;
      assert.equal(url.searchParams.get('spaces'), 'appDataFolder');
      return reply({ files: files.map(({ raw, ...file }) => file) });
    }
    const file = files.find(file => file.id === decodeURIComponent(url.pathname.split('/').pop()));
    return file ? reply(file.raw) : reply({}, 404);
  };
  return { files, calls, read, capture: extra => collectSnapshot({ read, ...rules,
    expectedAccountId: 'same-account', ...extra }) };
}
const rejects = (operation, code) => assert.rejects(operation, error => error.code === code && error.message === code);

test('fresh origin reconstructs legacy + writer union without mutation, retaining unlikes/viewed and existing writer identities', async () => {
  const f = fixture();
  const baseline = await f.capture();
  const candidate = await f.capture();
  assert.equal(candidate.remote.favorites.a.liked, false);
  assert.equal(candidate.remote.favorites.b.liked, true);
  assert.deepEqual(candidate.remote.viewed, { seen: 30, later: 20 });
  assert.deepEqual(candidate.files.map(file => file.writer).sort(), [null, 'first'].sort());
  const result = compareSnapshots(baseline, candidate, rules);
  assert.equal(result.comparisonSummary.remoteEquivalent, true);
  assert.equal(result.comparisonSummary.writeAuthorization, false);
  assert.equal(f.calls.length, 12);
  assert.deepEqual(f.files, seed(), 'GET-only capture leaves legacy and writer bodies untouched');
  const report = JSON.stringify(result.comparisonSummary);
  for (const privateValue of ['same-account', 'legacy', 'first', 'seen', 'later']) assert.ok(!report.includes(privateValue));
});

test('same counts with different private IDs or timestamps never prove equivalence', async () => {
  const a = await fixture([{ ...metadata('first'), raw: state({ a: { liked: false, updatedAt: 20 } }, { seen: 30 }) }]).capture();
  const b = await fixture([{ ...metadata('first'), raw: state({ b: { liked: false, updatedAt: 20 } }, { seen: 30 }) }]).capture();
  let report = compareSnapshots(a, b, rules).comparisonSummary;
  assert.deepEqual(report.baseline, report.candidate);
  assert.equal(report.remoteEquivalent, false);
  const changedTime = await fixture([{ ...metadata('first'), raw: state({ a: { liked: false, updatedAt: 20 } }, { seen: 31 }) }]).capture();
  report = compareSnapshots(a, changedTime, rules).comparisonSummary;
  assert.equal(report.remoteEquivalent, false);
});

test('transferred captures are revalidated; malformed metadata/state/union cannot assert stability', async () => {
  const captured = await fixture().capture();
  assert.equal(compareSnapshots(captured, structuredClone(captured), rules).comparisonSummary.remoteEquivalent, true);
  for (const fake of [null, {}, { stable: true, accountId: 'same-account', files: [], remote: state() }]) {
    assert.throws(() => compareSnapshots(captured, fake, rules), error => error.code === 'malformed_snapshot');
  }
  const modified = await fixture().capture();
  modified.remote = state();
  assert.throws(() => compareSnapshots(captured, modified, rules), error => error.code === 'snapshot_state_mismatch');
  const missing = structuredClone(captured); delete missing.files[0].raw;
  assert.throws(() => compareSnapshots(captured, missing, rules), error => error.code === 'malformed_state');
  const unknown = structuredClone(captured); unknown.files[0].raw.schemaVersion = 99;
  assert.throws(() => compareSnapshots(captured, unknown, rules), error => error.code === 'unsupported_schema');
  const duplicate = structuredClone(captured); duplicate.files.push(duplicate.files[0]);
  assert.throws(() => compareSnapshots(captured, duplicate, rules), error => error.code === 'duplicate_file');
  const writer = structuredClone(captured); writer.files[0].writer = 'another-writer';
  assert.throws(() => compareSnapshots(captured, writer, rules), error => error.code === 'malformed_snapshot');
  const emptyFlag = structuredClone(captured); emptyFlag.explicitlyEmpty = true;
  assert.throws(() => compareSnapshots(captured, emptyFlag, rules), error => error.code === 'empty_contract_mismatch');
});

test('raw schema and malformed values are rejected before product normalization loses evidence', async () => {
  for (const mutation of [raw => { raw.schemaVersion = 99; }, raw => { delete raw.schemaVersion; }]) {
    const data = [{ ...metadata('first'), raw: state() }]; mutation(data[0].raw);
    await rejects(fixture(data).capture(), 'unsupported_schema');
  }
  for (const raw of [null, [], {}, state({}, { zero: 0 }), state({ a: { liked: 'false', updatedAt: 20 } }),
    state({ a: { liked: false, updatedAt: -1 } }), state({}, { a: '12' }), { ...state(), viewed: [] }]) {
    await rejects(fixture([{ ...metadata('first'), raw }]).capture(), 'malformed_state');
  }
  const legacy = seed()[0]; delete legacy.raw.schemaVersion;
  legacy.raw.favorites = { falseBoolean: false, zero: { liked: false, updatedAt: 0 } };
  const result = await fixture([legacy]).capture();
  assert.equal(result.files[0].schemaVersion, null);
  assert.equal(result.remote.favorites.falseBoolean.liked, false);
  assert.equal(result.remote.favorites.zero.updatedAt, 0);
});

test('wrong account at either boundary and false request ownership abort safely', async () => {
  await rejects(fixture(seed(), ({ setAccount }) => setAccount('other-account')).capture(), 'account_mismatch');
  await rejects(fixture(seed(), ({ route, lists, setAccount }) => {
    if (route === 'account' && lists >= 2) setAccount('other-account');
  }).capture(), 'account_mismatch');
  await rejects(fixture().capture({ isCurrent: () => false }), 'stale_owner');
  let current = true;
  await rejects(fixture(seed(), ({ route }) => { if (route === 'body') current = false; })
    .capture({ isCurrent: () => current }), 'stale_owner');
});

test('missing listed file is fatal rather than an empty migration input', async () => {
  const f = fixture(seed(), ({ route, files }) => { if (route === 'body') files.length = 0; });
  await rejects(f.capture(), 'missing_file');
});

test('catalog pagination is complete; incomplete, duplicate and repeated pages fail', async () => {
  const files = seed(); let catalogs = 0;
  const base = fixture(files);
  const read = async (url, options) => {
    const query = new URL(url).searchParams;
    if (query.get('spaces') !== 'appDataFolder') return base.read(url, options);
    catalogs++;
    return new Response(JSON.stringify(query.has('pageToken')
      ? { files: [(({ raw, ...file }) => file)(files[1])] }
      : { files: [(({ raw, ...file }) => file)(files[0])], nextPageToken: 'second' }));
  };
  const result = await collectSnapshot({ read, ...rules, expectedAccountId: 'same-account' });
  assert.equal(result.files.length, 2); assert.equal(catalogs, 4);
  for (const [page, code] of [
    [{ files: [], incompleteSearch: true }, 'incomplete_catalog'],
    [{ files: [metadata('first'), metadata('first')] }, 'duplicate_file'],
    [{ files: [metadata('first', 'shared'), metadata('second', 'shared')] }, 'duplicate_writer'],
    [{ files: [], nextPageToken: 'loop' }, 'repeated_page'],
    [{ files: [], nextPageToken: '' }, 'malformed_catalog']
  ]) {
    await rejects(collectSnapshot({ ...rules, expectedAccountId: 'same-account',
      read: (url, options) => new URL(url).searchParams.has('spaces')
        ? Promise.resolve(new Response(JSON.stringify(page))) : base.read(url, options) }), code);
  }
});

test('one concurrent change retries only changed bodies; a second change fails', async () => {
  const f = fixture(seed(), ({ route, lists, files }) => {
    if (route === 'catalog' && lists === 1) {
      Object.assign(files[1], metadata('first', 'first', '2'));
      files[1].raw.viewed.later = 40;
    }
  });
  const result = await f.capture();
  assert.equal(result.capture.retries, 1);
  assert.equal(result.remote.viewed.later, 40);
  const bodies = f.calls.filter(url => url.searchParams.get('alt') === 'media');
  assert.equal(bodies.filter(url => url.pathname.endsWith('/legacy')).length, 1);
  assert.equal(bodies.filter(url => url.pathname.endsWith('/first')).length, 2);
  await rejects(fixture(seed(), ({ route, lists, files }) => {
    if (route === 'catalog' && (lists === 1 || lists === 3)) Object.assign(files[1], metadata('first', 'first', String(lists + 1)));
  }).capture(), 'concurrent_change');
});

test('local pending replica remains private and separate from confirmed remote evidence', async () => {
  const f = fixture(); const a = await f.capture(), b = await f.capture();
  const result = compareSnapshots(a, b, { ...rules, localReplicaAccountId: 'same-account',
    localReplica: state({ offline: { liked: false, updatedAt: 100 } }, { pendingSeen: 100 }) });
  assert.equal(result.comparisonSummary.remoteEquivalent, true);
  assert.equal(result.comparisonSummary.localPending, true);
  assert.equal(b.remote.favorites.offline, undefined);
  assert.equal(result.local.reconstruction.favorites.offline.liked, false);
  assert.equal(result.local.reconstruction.viewed.pendingSeen, 100);
  assert.equal(result.comparisonSummary.writeAuthorization, false);
  assert.throws(() => compareSnapshots(a, b, { ...rules, localReplicaAccountId: 'wrong', localReplica: state() }),
    error => error.code === 'local_account_mismatch');
  assert.equal(compareSnapshots(a, b, { ...rules, localReplicaAccountId: 'same-account', localReplica: state() })
    .comparisonSummary.localPending, false);
});

test('empty snapshot requires explicit approval and never matches a nonempty baseline', async () => {
  await rejects(fixture([]).capture(), 'empty_snapshot');
  const blankDocument = [{ ...metadata('blank'), raw: state() }];
  await rejects(fixture(blankDocument).capture(), 'empty_snapshot');
  const blank = await fixture(blankDocument).capture({ allowEmpty: true });
  assert.throws(() => compareSnapshots(blank, blank, rules), error => error.code === 'empty_baseline');
  assert.equal(compareSnapshots(blank, blank, { ...rules, approveEmptyBaseline: true }).comparisonSummary.remoteEquivalent, true);
  const empty = await fixture([]).capture({ allowEmpty: true });
  assert.throws(() => compareSnapshots(empty, empty, rules), error => error.code === 'empty_baseline');
  assert.equal(compareSnapshots(empty, empty, { ...rules, approveEmptyBaseline: true }).comparisonSummary.remoteEquivalent, true);
  const nonempty = await fixture().capture();
  assert.equal(compareSnapshots(nonempty, empty, { ...rules, approveEmptyBaseline: true }).comparisonSummary.remoteEquivalent, false);
});

test('cancellation and request, byte, file, page and elapsed-time budgets stop reads', async () => {
  const aborter = new AbortController(); aborter.abort();
  const f = fixture();
  await rejects(f.capture({ signal: aborter.signal }), 'cancelled'); assert.equal(f.calls.length, 0);
  await rejects(f.capture({ limits: { requests: 1 } }), 'request_limit');
  await rejects(fixture().capture({ limits: { bytes: 8 } }), 'byte_limit');
  await rejects(fixture().capture({ limits: { files: 1 } }), 'file_limit');
  let time = 100;
  await rejects(fixture(seed(), () => { time += 100; }).capture({ clock: () => time, limits: { milliseconds: 50 } }), 'time_limit');
  await rejects(fixture().capture({ limits: { requests: 101 } }), 'invalid_limits');
  const base = fixture();
  await rejects(collectSnapshot({ ...rules, expectedAccountId: 'same-account', limits: { pages: 1 },
    read: (url, options) => new URL(url).searchParams.has('spaces')
      ? Promise.resolve(new Response(JSON.stringify({ files: [], nextPageToken: 'second' }))) : base.read(url, options) }), 'page_limit');
});

test('deadline also bounds a noncooperative injected fetch and stalled response body', async () => {
  await rejects(collectSnapshot({ ...rules, expectedAccountId: 'same-account', limits: { milliseconds: 15 },
    read: () => new Promise(() => {}) }), 'time_limit');
  await rejects(collectSnapshot({ ...rules, expectedAccountId: 'same-account', limits: { milliseconds: 15 },
    read: async () => new Response(new ReadableStream({ start() {} })) }), 'time_limit');
});

test('canonical comparison ignores key order and preserves prototype-like IDs', () => {
  assert.equal(canonical({ b: 1, a: 2 }), canonical({ a: 2, b: 1 }));
  const raw = JSON.parse('{"schemaVersion":1,"updatedAt":0,"viewed":{"__proto__":12},"favorites":{"__proto__":{"liked":false,"updatedAt":0}}}');
  validateRawState(raw);
  assert.equal(Object.hasOwn(normalize(raw).favorites, '__proto__'), true);
});
