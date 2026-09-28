import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { collectSnapshot, canonical } from '../v2-state-snapshot/snapshot.mjs';
import { readLegacyReplica } from '../v2-state-snapshot/legacy-replica.mjs';
import { createRecoveryBackup } from '../v2-state-recovery-backup/backup.mjs';

const app = fs.readFileSync(new URL('../../app.js', import.meta.url), 'utf8');
const start = app.indexOf('function createEmptyAccountMediaState()'), end = app.indexOf('function accountFavoriteIds(', start);
assert.ok(start >= 0 && end > start);
const product = vm.createContext({});
vm.runInContext(`const ACCOUNT_STATE_SCHEMA_VERSION=1;${app.slice(start, end)}`, product);
const normalize = value => JSON.parse(JSON.stringify(product.normalizeAccountMediaState(value)));
const merge = (a, b) => JSON.parse(JSON.stringify(product.mergeAccountMediaStates(a, b)));
const account = 'synthetic-private-account', writer = 'synthetic-candidate-writer';
const rules = { expectedAccountId: account, normalize, merge };
const raw = { updatedAt: 20, favorites: { syntheticLike: true }, viewed: { syntheticViewed: 10 },
  benignNull: null, benignNested: { optional: null } };
const metadata = { id: 'synthetic-legacy-doc', name: 'drive-original-account-state.json',
  modifiedTime: '2026-09-28T00:00:01Z', version: '1' };
const snapshot = await collectSnapshot({ ...rules, read: async address => {
  const url = new URL(address);
  return new Response(JSON.stringify(url.pathname.endsWith('/about') ? { user: { permissionId: account } }
    : url.searchParams.get('alt') === 'media' ? raw : { files: [metadata] }));
} });
const projection = merge(snapshot.remote, { schemaVersion: 1, updatedAt: 30, favorites: {}, viewed: { syntheticPending: 30 } });
const cacheText = ' ' + JSON.stringify({ ...projection, localBenignNull: null }) + '\n';
const legacyLocal = readLegacyReplica({ storage: { getItem: key => key === 'drive-original.account-writer' ? null
  : JSON.stringify(normalize(raw)) }, origin: 'https://okjoizj-org.github.io', pathname: '/drive-original/version.json',
  expectedAccountId: account, fence: { accountId: account, current: true, readOnly: true } });
const backup = createRecoveryBackup({ ...rules, remoteSnapshot: snapshot, legacyLocal,
  candidate: { accountId: account, cacheText, runtimeProjection: projection, pending: true, writerId: writer, writerStorageText: writer } }).privatePayload;
const backupText = JSON.stringify(backup);
const bridgeSource = fs.readFileSync(new URL('./quiescent-run.function.js', import.meta.url), 'utf8');
const windowSource = fs.readFileSync(new URL('./quiescent-window-rc10.js', import.meta.url), 'utf8');

function environment({ construction, runFailure, pollFailure, clearSpy = () => {} } = {}) {
  const clearedTimers = [], reservedTimers = [], records = { parsed: null, runCalls: 0, clearCalls: 0, windowCalls: 0 };
  let nextTimer = 200;
  const state = { accountId: account, authAccountKey: 'synthetic-auth', authGeneration: 1, driveSessionGeneration: 2,
    accountStateLoaded: true, accountIdentityPending: false, accountStateRefreshTimer: 101,
    accountStateSyncTimer: 102, accountStateSyncRetryTimer: 103, accountStateLoadingPromise: null, accountStateSyncPromise: null,
    accountStateSyncRetryCount: 1, accountStateSyncError: null, mediaAttempt: 'idle', mediaAbortController: null,
    mediaBlobUrl: null, mediaTempStorage: null, pendingOriginalBuffer: null };
  const context = vm.createContext({ state, Date, navigator: { serviceWorker: { controller: {} } },
    document: { visibilityState: 'visible' }, q1Playback: null, q1RetirementResult: { settled: true },
    DRIVE_MUTATIONS_ENABLED: false, hasUsableToken: () => true, ACCOUNT_STATE_SYNC_DELAY_MS: 650,
    MAX_ORIGINAL_RETRY_AFTER_MS: 30_000,
    clearTimeout: id => { clearedTimers.push(id); },
    setTimeout: (callback, delay) => { const id = nextTimer++; reservedTimers.push({ id, callback, delay }); return id; },
    scheduleAccountStateRefresh: () => { state.accountStateRefreshTimer = nextTimer++; },
    flushAccountMediaState() { assert.fail('NO_REAL_FLUSH'); }
  });
  const globalKeys = Object.keys(context), targetPrototype = vm.runInContext('Object.prototype', context);
  const bridge = vm.runInContext(`(${bridgeSource})`, context);
  const quiescent = vm.runInContext(`(${windowSource})`, context);
  const factory = input => {
    createRecoveryBackup({ ...rules, remoteSnapshot: input.remote, candidate: input.candidate,
      legacyLocal: input.legacyLocal, evidence: input.evidence });
    return {
      run: async budget => { records.runCalls++; records.budget = budget; if (runFailure) throw runFailure; },
      poll: () => { if (pollFailure) throw new Error('SYNTHETIC_PRIVATE_POLL_MESSAGE'); return {
        done: true, gets: 10, posts: 1, ownerCurrent: true, summary: { passed: true } }; },
      clear: () => { records.clearCalls++; clearSpy(); }
    };
  };
  const facade = function (parsed, proof, key) {
    assert.equal(this, factory); assert.equal(proof, 'synthetic-proof'); assert.equal(key, 'synthetic-journal-key');
    records.parsed = parsed;
    assert.equal(Object.getPrototypeOf(parsed), targetPrototype, 'JSON.parse must run in target realm');
    if (construction) throw construction;
    return factory(parsed);
  };
  const window = callback => { records.windowCalls++; return quiescent(callback); };
  return { context, globalKeys, clearedTimers, reservedTimers, records, state,
    execute: text => bridge.call(window, factory, facade, text, 'synthetic-proof', 'synthetic-journal-key') };
}
function restored(result, f) {
  assert.deepEqual(JSON.parse(JSON.stringify(result.paused)), { refresh: true, sync: true, retry: true });
  assert.deepEqual(JSON.parse(JSON.stringify(result.restored)), { refresh: true, sync: true, retry: true });
  assert.ok(Number.isSafeInteger(result.elapsedMs)); assert.equal(result.writeGateDisabled, true);
  assert.equal(result.scope, 'Controlled same-page state timers paused and restored; one own-writer create only');
  assert.deepEqual(f.clearedTimers.slice(0, 3), [101, 102, 103]);
  assert.ok(f.state.accountStateRefreshTimer); assert.ok(f.state.accountStateSyncTimer); assert.ok(f.state.accountStateSyncRetryTimer);
  assert.deepEqual(Object.keys(f.context), f.globalKeys, 'bridge adds no global bindings');
}

test('measured omitted-null structured object fails required writer validation; serialized text preserves every nullable field and schema-less raw JSON', () => {
  const omitted = JSON.parse(backupText); delete omitted.remote.files[0].writer;
  assert.throws(() => createRecoveryBackup({ ...rules, remoteSnapshot: omitted.remote,
    candidate: omitted.candidate, legacyLocal: omitted.legacyLocal, evidence: omitted.evidence }), cause => cause.code === 'invalid_backup');
  const exact = JSON.parse(backupText);
  assert.equal(exact.remote.files[0].writer, null); assert.equal(Object.hasOwn(exact.remote.files[0], 'writer'), true);
  assert.equal(exact.remote.files[0].schemaVersion, null); assert.equal(Object.hasOwn(exact.remote.files[0].raw, 'schemaVersion'), false);
  assert.equal(Object.hasOwn(exact.remote.files[0].raw, 'benignNull'), true); assert.equal(exact.remote.files[0].raw.benignNull, null);
  assert.equal(exact.remote.files[0].raw.benignNested.optional, null); assert.equal(exact.legacyLocal.writerId, null);
  assert.equal(JSON.parse(exact.candidate.cacheText).localBenignNull, null);
  assert.equal(createRecoveryBackup({ ...rules, remoteSnapshot: exact.remote,
    candidate: exact.candidate, legacyLocal: exact.legacyLocal, evidence: exact.evidence }).summary.passed, true);
});

test('actual text bridge parses faithful input in target realm, executes spy factory/facade inside actual quiescent window, then clears', async () => {
  const f = environment(), result = await f.execute(backupText);
  assert.equal(canonical(f.records.parsed), canonical(backup)); assert.equal(JSON.stringify(f.records.parsed), backupText);
  assert.equal(f.records.parsed.remote.files[0].writer, null); assert.equal(f.records.parsed.remote.files[0].raw.benignNull, null);
  assert.equal(f.records.parsed.candidate.cacheText, cacheText);
  assert.equal(f.records.runCalls, 1); assert.equal(f.records.clearCalls, 1); assert.equal(f.records.windowCalls, 1);
  assert.ok(f.records.budget > 50_000 && f.records.budget <= 54_000);
  assert.equal(result.result.summary.passed, true); restored(result, f);
  assert.equal(JSON.stringify(result).includes('synthetic-'), false);
});

test('construction errors remain fixed codes with zero GET/POST and full quiescent restoration; malformed/object transfer also fails closed', async () => {
  for (const [construction, expected] of [
    [Object.assign(new Error('SYNTHETIC_PRIVATE_MESSAGE'), { code: 'invalid_backup' }), 'invalid_backup'],
    [Object.assign(new Error('SYNTHETIC_PRIVATE_MESSAGE'), { code: 'stale_owner' }), 'stale_owner'],
    [new Error('OWN_WRITER_PREFLIGHT_REJECTED'), 'facade_preflight'],
    [new Error('SYNTHETIC_PRIVATE_MESSAGE'), 'construction_failed']
  ]) {
    const f = environment({ construction }), result = await f.execute(backupText);
    assert.equal(result.result.summary.failure, expected); assert.equal(result.result.constructionFailed, true);
    assert.equal(result.result.gets, 0); assert.equal(result.result.posts, 0);
    assert.equal(f.records.runCalls, 0); assert.equal(f.records.clearCalls, 0); restored(result, f);
    assert.equal(JSON.stringify(result).includes('SYNTHETIC_PRIVATE_MESSAGE'), false);
  }
  for (const input of ['{', backup]) {
    const f = environment(), result = await f.execute(input);
    assert.equal(result.result.summary.failure, 'construction_failed'); assert.equal(f.records.runCalls, 0); restored(result, f);
  }
  const omitted = JSON.parse(backupText); delete omitted.remote.files[0].writer;
  const f = environment(), result = await f.execute(JSON.stringify(omitted));
  assert.equal(result.result.summary.failure, 'invalid_backup'); assert.equal(result.result.posts, 0); restored(result, f);
});

test('post-construction error clears job once while preserving fixed failure and full window stats', async () => {
  const f = environment({ runFailure: Object.assign(new Error('SYNTHETIC_PRIVATE_RUN_MESSAGE'), { code: 'candidate_changed' }) });
  const result = await f.execute(backupText);
  assert.equal(result.result.summary.failure, 'candidate_changed'); assert.equal(result.result.constructionFailed, false);
  assert.equal(result.result.gets, 10); assert.equal(result.result.posts, 1);
  assert.equal(f.records.clearCalls, 1); restored(result, f);
  assert.equal(JSON.stringify(result).includes('SYNTHETIC_PRIVATE_RUN_MESSAGE'), false);
});

test('poll exceptions use unknown-count fallback instead of fabricating zero dispatch; clear and quiescent stats survive', async () => {
  const f = environment({ pollFailure: true }), result = await f.execute(backupText);
  assert.equal(result.result.summary.passed, false); assert.equal(result.result.summary.failure, 'construction_failed');
  assert.equal(result.result.constructionFailed, false);
  assert.notEqual(result.result.gets, 0); assert.notEqual(result.result.posts, 0);
  assert.equal(f.records.clearCalls, 1); restored(result, f);
  assert.equal(JSON.stringify(result).includes('SYNTHETIC_PRIVATE_POLL_MESSAGE'), false);
});
