import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { collectSnapshot, canonical } from '../v2-state-snapshot/snapshot.mjs';
import { readLegacyReplica } from '../v2-state-snapshot/legacy-replica.mjs';
import { captureRecoveryBackup, createRecoveryBackup, serializePrivateBackup, verifyRecoveryReread, safeBackupFailure } from './backup.mjs';
import { createRecoveryBackupHandle } from './handle.mjs';
import { buildRecoveryBackupFactory } from './build-browser-factory.mjs';

// Execute current product normalization/merge, not a QA conflict implementation.
const source = fs.readFileSync(new URL('../../app.js', import.meta.url), 'utf8');
const start = source.indexOf('function createEmptyAccountMediaState()');
const end = source.indexOf('function accountFavoriteIds(', start);
assert.ok(start >= 0 && end > start);
const app = vm.createContext({});
vm.runInContext(`const ACCOUNT_STATE_SCHEMA_VERSION = 1;${source.slice(start, end)}`, app);
const normalize = value => JSON.parse(JSON.stringify(app.normalizeAccountMediaState(value)));
const merge = (a, b) => JSON.parse(JSON.stringify(app.mergeAccountMediaStates(a, b)));
const account = 'synthetic-private-account';
const rules = { expectedAccountId: account, normalize, merge };
const state = (favorites = {}, viewed = {}) => ({ schemaVersion: 1, updatedAt: 30, favorites, viewed });
const initial = [
  { id: 'private-legacy-file', name: 'drive-original-account-state.json', modifiedTime: '2026-09-28T00:00:01Z', version: '1',
    raw: { updatedAt: 10, favorites: { privateTie: { liked: true, updatedAt: 20 }, privateOldBoolean: true }, viewed: { privateSeen: 10 }, extraPreserved: { note: '원문' } } },
  { id: 'private-writer-file', name: 'drive-original-account-state-v2-private-old-writer.json', modifiedTime: '2026-09-28T00:00:02Z', version: '2',
    raw: state({ privateTie: { liked: false, updatedAt: 20 } }, { privateSeen: 20 }) }
];
function fixture(hook = () => {}) {
  const docs = structuredClone(initial), calls = [];
  const read = async (address, options) => {
    const url = new URL(address); calls.push(url);
    assert.equal(options.method, 'GET'); assert.ok(options.signal instanceof AbortSignal);
    assert.equal(url.origin, 'https://www.googleapis.com');
    const route = url.pathname.endsWith('/about') ? 'account' : url.searchParams.get('alt') === 'media' ? 'body' : 'catalog';
    const custom = hook({ route, docs, calls, url });
    if (custom) return new Response(JSON.stringify(custom.body), { status: custom.status || 200 });
    if (route === 'account') return new Response(JSON.stringify({ user: { permissionId: account } }));
    if (route === 'catalog') return new Response(JSON.stringify({ files: docs.map(({ raw, ...metadata }) => metadata) }));
    const file = docs.find(file => file.id === decodeURIComponent(url.pathname.split('/').pop()));
    return new Response(JSON.stringify(file?.raw || {}), { status: file ? 200 : 404 });
  };
  return { docs, calls, read };
}
function legacy(raw = state({ privateTie: { liked: false, updatedAt: 20 } }, { privateSeen: 10 })) {
  const entries = new Map([['drive-original.account-state.' + account, JSON.stringify(raw)], ['drive-original.account-writer', 'private-legacy-writer']]);
  return readLegacyReplica({ storage: { getItem: key => entries.get(key) ?? null }, origin: 'https://okjoizj-org.github.io',
    pathname: '/drive-original/version.json', expectedAccountId: account, fence: { accountId: account, current: true, readOnly: true } });
}
function candidate(remote) {
  const cached = merge(remote, state({ privatePendingUnlike: { liked: false, updatedAt: 30 } }, { privatePendingSeen: 30 }));
  return { accountId: account, cacheText: '  ' + JSON.stringify(cached) + '\n', runtimeProjection: cached,
    pending: true, writerId: 'private-candidate-writer', writerStorageText: 'private-candidate-writer' };
}
async function ready() {
  const f = fixture(); const remoteSnapshot = await collectSnapshot({ read: f.read, ...rules });
  return { f, remoteSnapshot, candidate: candidate(remoteSnapshot.remote), legacyLocal: legacy() };
}
function create(values, extra = {}) { return createRecoveryBackup({ ...values, ...rules, ...extra }); }
function reread(original, text, extra = {}) { return verifyRecoveryReread({ original, rereadText: text, ...rules, ...extra }); }
const throws = (operation, code) => assert.throws(operation, cause => cause.code === code && cause.message === code);
const rejects = (operation, code) => assert.rejects(operation, cause => cause.code === code && cause.message === code);

test('actual collector contract round-trips every raw legacy/writer document, exact local text and separate pending replica', async () => {
  const values = await ready(); const before = structuredClone(values.remoteSnapshot);
  const result = create(values);
  assert.equal(result.summary.remoteFiles, 2); assert.equal(result.summary.remoteWriters, 1);
  assert.equal(result.summary.candidatePending, true); assert.equal(result.summary.candidateIncludesLegacy, true);
  assert.equal(result.privatePayload.remote.files[0].raw.extraPreserved.note, '원문');
  assert.equal(result.privatePayload.remote.files[0].raw.schemaVersion, undefined, 'schema-less legacy remains schema-less');
  assert.equal(result.privatePayload.candidate.cacheText, values.candidate.cacheText);
  assert.deepEqual(values.remoteSnapshot, before);
  const text = serializePrivateBackup(result.privatePayload, rules);
  assert.equal(reread(result.privatePayload, text).rereadEquivalent, true);
  assert.equal(result.privatePayload.remote.remote.favorites.privateTie.liked, false);
  assert.equal(result.privatePayload.remote.remote.viewed.privateSeen, 20);
  assert.equal(Object.hasOwn(result.privatePayload.remote.remote.viewed, 'privatePendingSeen'), false);
  assert.equal(result.privatePayload.candidate.runtimeProjection.viewed.privatePendingSeen, 30);
  assert.equal(values.f.calls.length, 6); assert.deepEqual(values.f.docs, initial);
});

test('public success/failure contains fixed aggregate values only, never raw state/IDs/fingerprints/credential fields', async () => {
  const { summary, privatePayload } = create(await ready());
  const report = JSON.stringify(summary);
  for (const secret of [account, 'private-', 'cacheText', 'rawText', 'writerId', 'digest', 'hash', 'token', 'cookie']) assert.equal(report.includes(secret), false);
  const onlyAggregate = value => typeof value === 'boolean' || typeof value === 'number'
    || (value && typeof value === 'object' && Object.values(value).every(onlyAggregate));
  assert.ok(onlyAggregate(summary));
  assert.deepEqual(safeBackupFailure(new Error(account)), { passed: false, failure: 'invalid_backup' });
  assert.equal(summary.projectClientBindingVerified, false);
  const verified = create({ remoteSnapshot: privatePayload.remote, candidate: privatePayload.candidate, legacyLocal: privatePayload.legacyLocal },
    { evidence: { projectClientBinding: 'verified' } });
  assert.equal(verified.summary.projectClientBindingVerified, true);
});

test('same-count changed IDs/timestamps and exact cache whitespace changes fail reread against retained original', async () => {
  const { privatePayload } = create(await ready());
  for (const changed of ['writerId', 'cacheWhitespace', 'viewTimestamp', 'sameCountIds']) {
    const tampered = structuredClone(privatePayload);
    if (changed === 'writerId') tampered.candidate.writerId = 'private-other-writer';
    if (changed === 'cacheWhitespace') tampered.candidate.cacheText += ' ';
    if (changed === 'viewTimestamp') tampered.legacyLocal.rawText = JSON.stringify(state({ privateTie: { liked: false, updatedAt: 20 } }, { privateSeen: 11 }));
    if (changed === 'sameCountIds') tampered.legacyLocal.rawText = JSON.stringify(state({ privateTie: { liked: false, updatedAt: 20 } }, { privateDifferentSeen: 10 }));
    throws(() => reread(privatePayload, JSON.stringify(tampered)), 'reread_mismatch');
  }
  const reordered = JSON.stringify(privatePayload, null, 2);
  assert.equal(reread(privatePayload, reordered).rereadEquivalent, true, 'outer formatting is irrelevant, embedded exact cache text is not');
});

test('malformed metadata/raw schema, missing document, false union or pending, candidate reconstruction, and identity are rejected', async () => {
  const { privatePayload } = create(await ready());
  for (const [mutate, code] of [
    [value => value.remote.files[0].raw.schemaVersion = 99, 'unsupported_schema'],
    [value => value.remote.files[0].writer = 'false-writer', 'malformed_snapshot'],
    [value => value.remote.files.pop(), 'snapshot_state_mismatch'],
    [value => value.remote.files.push(value.remote.files[0]), 'duplicate_file'],
    [value => value.remote.remote = normalize({}), 'snapshot_state_mismatch'],
    [value => value.candidate.pending = false, 'pending_mismatch'],
    [value => value.candidate.runtimeProjection = normalize({}), 'candidate_reconstruction_mismatch'],
    [value => value.candidate.accountId = 'other-account', 'account_mismatch'],
    [value => value.legacyLocal.accountId = 'other-account', 'account_mismatch'],
    [value => value.candidate.token = 'DO_NOT_COPY', 'invalid_backup'],
    [value => value.remote.files[0].raw.extraPreserved.refreshToken = 'DO_NOT_COPY', 'credential_field'],
    [value => value.evidence.projectClientBinding = 'assumed', 'invalid_backup']
  ]) {
    const bad = structuredClone(privatePayload); mutate(bad);
    throws(() => reread(privatePayload, JSON.stringify(bad)), code);
  }
});

test('known credential extension fields are rejected without treating media IDs as credentials or losing benign raw extensions', async () => {
  const values = await ready();
  values.legacyLocal = legacy(state({ token: true, cookie: false }, { accessToken: 10 }));
  assert.equal(create(values).summary.legacy.liked, 1);
  assert.equal(create(values).summary.legacy.unliked, 1);
  const bad = structuredClone(values.remoteSnapshot); bad.remote.cookie = 'DO_NOT_COPY';
  throws(() => create({ ...values, remoteSnapshot: bad }), 'credential_field');
});

test('backup copies independent inputs, preserves unmerged legacy state, and computes inclusion without requiring it', async () => {
  const values = await ready(); values.legacyLocal = legacy(state({}, { privateLegacyPending: 50 }));
  const result = create(values);
  assert.equal(result.summary.candidateIncludesLegacy, false);
  assert.equal(Object.hasOwn(result.privatePayload.candidate.runtimeProjection.viewed, 'privateLegacyPending'), false);
  values.remoteSnapshot.files[0].raw.updatedAt = 999;
  assert.notEqual(result.privatePayload.remote.files[0].raw.updatedAt, 999);
  assert.equal(reread(result.privatePayload, serializePrivateBackup(result.privatePayload, rules)).candidateIncludesLegacy, false);
});

test('live capture reuses GET-only collector and detects candidate raw text/writer/runtime/legacy changes during remote reads', async () => {
  const initialRemote = merge(normalize(initial[0].raw), normalize(initial[1].raw));
  for (const change of ['none', 'cache', 'writer', 'runtime', 'legacy']) {
    const local = candidate(initialRemote), legacyLocal = legacy();
    const f = fixture(({ route }) => {
      if (route !== 'body') return;
      if (change === 'cache') local.cacheText += ' ';
      if (change === 'writer') local.writerId = 'different-private-writer';
      if (change === 'runtime') local.runtimeProjection = normalize({});
      if (change === 'legacy') legacyLocal.rawText += ' ';
    });
    const action = captureRecoveryBackup({ read: f.read, readCandidate: () => local, legacyLocal, ...rules });
    if (change === 'none') assert.equal((await action).summary.passed, true);
    else await rejects(action, 'candidate_changed');
    assert.deepEqual(f.docs, initial);
  }
});

test('current fences exclude write sync/owner drift; benign load does not veto stable local evidence; cancellation/read failure propagates', async () => {
  const local = candidate(merge(normalize(initial[0].raw), normalize(initial[1].raw)));
  let syncActive = true, loading = true;
  const f = fixture();
  await rejects(captureRecoveryBackup({ read: f.read, readCandidate: () => local, legacyLocal: legacy(), ...rules,
    isCurrent: () => !syncActive }), 'stale_owner');
  assert.equal(f.calls.length, 0);
  syncActive = false;
  assert.equal((await captureRecoveryBackup({ read: f.read, readCandidate: () => local, legacyLocal: legacy(), ...rules,
    isCurrent: () => !syncActive && loading })).summary.passed, true);
  const controller = new AbortController(); controller.abort();
  await rejects(captureRecoveryBackup({ read: f.read, readCandidate: () => local, legacyLocal: legacy(), ...rules,
    signal: controller.signal }), 'cancelled');
  const missing = fixture(({ route }) => route === 'body' ? { body: {}, status: 404 } : null);
  await rejects(captureRecoveryBackup({ read: missing.read, readCandidate: () => local, legacyLocal: legacy(), ...rules }), 'missing_file');
  const incomplete = fixture(({ route }) => route === 'catalog' ? { body: { files: [], incompleteSearch: true } } : null);
  await rejects(captureRecoveryBackup({ read: incomplete.read, readCandidate: () => local, legacyLocal: legacy(), ...rules }), 'incomplete_catalog');
});

test('lossy/non-JSON/private over-limit inputs never pass serialization or recovery verification', async () => {
  const { privatePayload } = create(await ready());
  for (const forbidden of [undefined, NaN, () => {}, new Date()]) {
    const bad = structuredClone(privatePayload); bad.remote.files[0].raw.extra = forbidden;
    throws(() => serializePrivateBackup(bad, rules), 'invalid_json_data');
  }
  const cycle = structuredClone(privatePayload); cycle.remote.files[0].raw.extra = cycle;
  throws(() => serializePrivateBackup(cycle, rules), 'invalid_json_data');
  const large = structuredClone(privatePayload); large.candidate.cacheText = 'a'.repeat(8 * 1024 * 1024 + 1);
  throws(() => serializePrivateBackup(large, rules), 'invalid_backup');
  throws(() => reread(privatePayload, '{'), 'invalid_json');
  throws(() => reread(privatePayload, JSON.stringify(privatePayload), { isCurrent: () => false }), 'stale_owner');
  assert.ok(canonical(privatePayload).includes('private-'), 'private data exists only in the private payload');
});

test('deterministic browser factory has no global writes; actual collector/merge capture exposes private data only through separate handle methods', async () => {
  const first = await buildRecoveryBackupFactory(), second = await buildRecoveryBackupFactory();
  assert.equal(first, second);
  const values = await ready();
  const f = fixture();
  const dependencies = { read: f.read, readCandidate: () => values.candidate,
    legacyLocal: values.legacyLocal, ...rules, isCurrent: () => true };
  const context = vm.createContext({ AbortController, TextEncoder, TextDecoder, Uint8Array, URLSearchParams,
    setTimeout, clearTimeout, dependencies });
  const beforeKeys = Object.keys(context);
  const factory = vm.runInContext(first, context);
  assert.equal(typeof factory, 'function'); assert.deepEqual(Object.keys(context), beforeKeys);
  const handle = factory(dependencies);
  const summary = await handle.capture();
  assert.equal(summary.passed, true); assert.equal(JSON.stringify(summary).includes('private-'), false);
  assert.deepEqual(Object.keys(context), beforeKeys);
  assert.equal(handle.safeSummary().passed, true);
  assert.equal(Object.hasOwn(handle, 'privatePayload'), false);
  assert.equal(handle.readPrivatePayload().candidate.cacheText, values.candidate.cacheText);
  const text = handle.readPrivateText();
  assert.equal(handle.verifyReread(text).rereadEquivalent, true);
  assert.equal(handle.verifyReread('{').failure, 'invalid_json');
  assert.equal((await handle.capture()).failure, 'run_already_claimed');
  assert.equal(f.calls.length, 6);
  handle.clear();
  assert.equal(handle.safeSummary().failure, 'backup_cleared');
  throws(() => handle.readPrivatePayload(), 'backup_cleared');
  assert.equal(handle.verifyReread(text).failure, 'backup_cleared');
});

test('handle clear/cancellation/failure never exposes partial backup or consumes provider error data', async () => {
  const values = await ready();
  let resolve;
  const handle = createRecoveryBackupHandle({ ...rules, legacyLocal: values.legacyLocal,
    readCandidate: () => values.candidate, isCurrent: () => true, read: () => new Promise(done => { resolve = done; }) });
  const capture = handle.capture(); handle.clear();
  assert.equal((await capture).failure, 'backup_cleared');
  throws(() => handle.readPrivateText(), 'backup_cleared');
  resolve(new Response('{}'));
  let consumed = false;
  const rejected = createRecoveryBackupHandle({ ...rules, legacyLocal: values.legacyLocal,
    readCandidate: () => values.candidate, isCurrent: () => true,
    read: async () => ({ ok: false, status: 403, body: { getReader() { consumed = true; throw new Error('SECRET'); } } }) });
  assert.equal((await rejected.capture()).failure, 'read_failed');
  assert.equal(consumed, false);
  throws(() => rejected.readPrivatePayload(), 'backup_unavailable');
});
