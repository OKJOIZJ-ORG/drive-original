import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { readLegacyReplica, compareLegacyReplica, safeLegacyFailure } from './legacy-replica.mjs';
import { buildLegacyReadFunction, buildLegacyCompareFunction } from './legacy-browser-builder.mjs';

const source = fs.readFileSync(new URL('../../app.js', import.meta.url), 'utf8');
const first = source.indexOf('function createEmptyAccountMediaState()');
const last = source.indexOf('function accountFavoriteIds(', first);
const app = vm.createContext({});
vm.runInContext(`const ACCOUNT_STATE_SCHEMA_VERSION = 1;${source.slice(first, last)}`, app);
const normalize = value => JSON.parse(JSON.stringify(app.normalizeAccountMediaState(value)));
const merge = (a, b) => JSON.parse(JSON.stringify(app.mergeAccountMediaStates(a, b)));
const rules = { normalize, merge };
const origin = 'https://okjoizj-org.github.io', pathname = '/drive-original/version.json';
const account = 'private-account', key = 'drive-original.account-state.' + account;
const writerKey = 'drive-original.account-writer';
const raw = { schemaVersion: 1, updatedAt: 20, viewed: { privateViewed: 10 },
  favorites: { privateUnlike: { liked: false, updatedAt: 20 }, privateLike: { liked: true, updatedAt: 10 } } };
const fence = { accountId: account, current: true, readOnly: true };
function store(initial = raw, writer = 'legacy-writer') {
  const entries = new Map([[key, initial === null ? null : JSON.stringify(initial)], [writerKey, writer]]);
  const reads = [];
  return { entries, reads, storage: { getItem(name) { reads.push(name); return entries.get(name) ?? null; } } };
}
const read = f => readLegacyReplica({ storage: f.storage, origin, pathname, expectedAccountId: account, fence });
const compare = (payload, candidateProjection, extra = {}) => compareLegacyReplica({ payload,
  expectedAccountId: account, fence, candidateProjection, ...rules, ...extra });
const rejects = (fn, code) => assert.throws(fn, error => error.code === code && error.message === code);

test('inert legacy boundary reads only the exact account key and optional writer twice without storage changes', () => {
  const f = store(), before = [...f.entries];
  const payload = read(f);
  assert.equal(payload.rawText, JSON.stringify(raw));
  assert.deepEqual(f.reads, [key, writerKey, key, writerKey]);
  assert.deepEqual([...f.entries], before);
  const withoutWriter = readLegacyReplica({ storage: f.storage, origin, pathname,
    expectedAccountId: account, fence, readWriter: false });
  assert.equal(withoutWriter.writerId, null); assert.equal(withoutWriter.writerRead, false);
  assert.deepEqual(f.reads.slice(4), [key, key]);
});

test('absence identifies this exact profile/account cache only and does not normalize to success', () => {
  const f = store(null); f.entries.set('drive-original.account-state.other-account', JSON.stringify(raw));
  rejects(() => read(f), 'legacy_cache_absent'); assert.deepEqual(f.reads, [key]);
  assert.deepEqual(safeLegacyFailure({ code: 'legacy_cache_absent', message: account }), {
    passed: false, failure: 'legacy_cache_absent', writeAuthorization: false, remoteVerified: false, deviceVerified: false });
});

test('wrong origin/app path/account/current/readOnly fence prevents any storage read', () => {
  for (const [extra, code] of [
    [{ origin: 'https://wrong.test' }, 'wrong_origin'], [{ pathname: '/drive-original/' }, 'wrong_origin'],
    [{ fence: { ...fence, accountId: 'other' } }, 'account_mismatch'],
    [{ fence: { ...fence, current: false } }, 'stale_owner'],
    [{ fence: { ...fence, readOnly: false } }, 'read_only_required']
  ]) {
    const f = store();
    rejects(() => readLegacyReplica({ storage: f.storage, origin, pathname, expectedAccountId: account, fence, ...extra }), code);
    assert.equal(f.reads.length, 0);
  }
});

test('raw schema, JSON, types and timestamps are checked before normalization and bounded in UTF-8 bytes', () => {
  for (const [body, code] of [
    [{ ...raw, schemaVersion: 99 }, 'unsupported_schema'], [{ ...raw, schemaVersion: undefined }, 'unsupported_schema'],
    [{ ...raw, viewed: { bad: 0 } }, 'malformed_state'], [{ ...raw, viewed: { bad: '10' } }, 'malformed_state'],
    [{ ...raw, favorites: { bad: { liked: 'false', updatedAt: 20 } } }, 'malformed_state'],
    [{ ...raw, favorites: { bad: { liked: false, updatedAt: -1 } } }, 'malformed_state']
  ]) rejects(() => read(store(body)), code);
  const broken = store(); broken.entries.set(key, '{'); rejects(() => read(broken), 'malformed_state');
  const unicode = store({ ...raw, unused: '한'.repeat(20) });
  const text = unicode.entries.get(key);
  rejects(() => readLegacyReplica({ storage: unicode.storage, origin, pathname, expectedAccountId: account, fence,
    maxBytes: text.length }), 'byte_limit');
  const legacyBooleans = read(store({ schemaVersion: 1, updatedAt: 0, viewed: {}, favorites: { old: false } }));
  assert.equal(compare(legacyBooleans, normalize({})).favoritesAdded, 1);
});

test('both repeated raw cache and writer reads must remain identical', () => {
  for (const changed of [key, writerKey]) {
    const f = store(); let calls = 0;
    f.storage.getItem = name => {
      if (++calls === 3) f.entries.set(changed, changed === key ? JSON.stringify({ ...raw, updatedAt: 30 }) : 'different-writer');
      return f.entries.get(name) ?? null;
    };
    rejects(() => read(f), 'storage_changed');
  }
  const f = store(); let checks = 0;
  rejects(() => readLegacyReplica({ storage: f.storage, origin, pathname, expectedAccountId: account, fence,
    isCurrent: () => ++checks === 1 }), 'stale_owner');
});

test('actual app union preserves unlike ties and latest viewed values; only aggregate differences leave comparison', () => {
  const payload = read(store());
  const candidate = normalize({ schemaVersion: 1, updatedAt: 20, viewed: { privateViewed: 5 },
    favorites: { privateUnlike: { liked: true, updatedAt: 20 } } });
  const result = compare(payload, candidate, { candidateWriterId: 'candidate-writer' });
  assert.equal(result.passed, true); assert.equal(result.candidateProjectionIncludesLegacy, false);
  assert.equal(result.mergeAddsOrChanges, true); assert.equal(result.writerDistinct, true);
  assert.equal(result.favoritesAdded, 1); assert.equal(result.favoritesChanged, 1); assert.equal(result.viewedChanged, 1);
  assert.equal(result.merged.unliked, 1); assert.equal(result.merged.liked, 1);
  for (const secret of [account, 'legacy-writer', 'candidate-writer', 'privateViewed', 'privateLike', 'privateUnlike', 'rawText']) {
    assert.equal(JSON.stringify(result).includes(secret), false);
  }
  assert.equal(result.writeAuthorization, false); assert.equal(result.remoteVerified, false); assert.equal(result.deviceVerified, false);
});

test('equivalent/newer candidate projection includes legacy without equating writer identities or copying cache', () => {
  const payload = read(store());
  const equivalent = compare(payload, normalize(raw), { candidateWriterId: 'legacy-writer' });
  assert.equal(equivalent.candidateProjectionIncludesLegacy, true); assert.equal(equivalent.writerDistinct, false);
  const newer = normalize({ ...raw, viewed: { privateViewed: 30 }, favorites: {
    privateUnlike: { liked: false, updatedAt: 40 }, privateLike: { liked: false, updatedAt: 30 } } });
  assert.equal(compare(payload, newer).mergeAddsOrChanges, false);
  assert.equal(compare(payload, newer).writerDistinct, null);
  assert.equal(payload.rawText, JSON.stringify(raw));
});

test('transferred payload account/provenance/schema and ownership remain checked at comparison', () => {
  const payload = read(store());
  rejects(() => compare({ ...payload, accountId: 'other' }, normalize(raw)), 'account_mismatch');
  rejects(() => compare({ ...payload, origin: 'https://wrong.test' }, normalize(raw)), 'invalid_transport');
  rejects(() => compare({ ...payload, repeatedReadsEqual: false }, normalize(raw)), 'invalid_transport');
  rejects(() => compare({ ...payload, rawText: JSON.stringify({ ...raw, schemaVersion: 2 }) }, normalize(raw)), 'unsupported_schema');
  let calls = 0;
  rejects(() => compare(payload, normalize(raw), { isCurrent: () => ++calls === 1 }), 'stale_owner');
  assert.equal(safeLegacyFailure(new Error('private-sensitive-message')).failure, 'invalid_contract');
});

test('generated inert reader executes without app bindings/fetch and emits private transport only to caller memory', async () => {
  const f = store();
  const c = vm.createContext({ TextEncoder, location: { origin, pathname }, localStorage: f.storage,
    privateArgs: { expectedAccountId: account, fence }, fetch() { throw new Error('NO_NETWORK'); } });
  const payload = vm.runInContext(`(${await buildLegacyReadFunction()})(privateArgs)`, c);
  assert.equal(payload.privateTransport, true); assert.equal(payload.rawText, JSON.stringify(raw));
  assert.deepEqual(f.reads, [key, writerKey, key, writerKey]);
});

test('generated sources tree-shake remote collector and unused public helper without duplicating validation', async () => {
  const reader = await buildLegacyReadFunction(), comparator = await buildLegacyCompareFunction();
  for (const generated of [reader, comparator]) {
    assert.equal(/collectSnapshot|compareSnapshots|incompleteSearch|appDataFolder|\/drive\/v3\//.test(generated), false);
    assert.ok(generated.length < 10000);
  }
  assert.equal(reader.includes('compareLegacyReplica'), false);
  assert.equal(comparator.includes('readLegacyReplica'), false);
});

test('generated candidate comparison works in background and fences actual owner/projection/cache/retirement changes', async () => {
  const payload = read(store());
  const expectedOwner = { accountId: account, authAccountKey: 'private-auth', authGeneration: 1,
    driveSessionGeneration: 2, current: true };
  const generated = await buildLegacyCompareFunction();
  for (const change of ['none', 'account', 'missingOwner', 'writesEnabled', 'retirement', 'projection', 'cache', 'controller', 'generation', 'writer']) {
    const f = store(raw, 'candidate-writer');
    const state = { ...expectedOwner, accountStateLoaded: true, accountMediaState: normalize(raw), mediaAttempt: 'idle' };
    const c = vm.createContext({ TextEncoder, state, APP_VERSION: JSON.parse(fs.readFileSync(new URL('../../version.json', import.meta.url))).version,
      DRIVE_MUTATIONS_ENABLED: false, q1Playback: null, q1RetirementResult: { settled: true },
      navigator: { serviceWorker: { controller: {} } }, document: { visibilityState: 'hidden' },
      location: { origin: 'https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev' },
      localStorage: f.storage, normalizeAccountMediaState: normalize,
      mergeAccountMediaStates: (a, b) => {
        if (change === 'projection') state.accountMediaState = normalize({});
        if (change === 'cache') f.entries.set(key, '{}');
        if (change === 'controller') c.navigator.serviceWorker.controller = {};
        if (change === 'generation') state.authGeneration++;
        if (change === 'writer') f.entries.set(writerKey, 'changed-writer');
        return merge(a, b);
      }, privateArgs: { payload, expectedOwner }, fetch() { throw new Error('NO_NETWORK'); } });
    if (change === 'account') state.accountId = 'other';
    if (change === 'missingOwner') c.privateArgs.expectedOwner = undefined;
    if (change === 'writesEnabled') c.DRIVE_MUTATIONS_ENABLED = true;
    if (change === 'retirement') c.q1RetirementResult = null;
    const result = vm.runInContext(`(${generated})(privateArgs)`, c);
    assert.equal(result.passed, change === 'none');
    if (change !== 'none') assert.ok(['stale_owner', 'account_mismatch', 'invalid_contract', 'read_only_required'].includes(result.failure));
    if (['account', 'missingOwner', 'writesEnabled', 'retirement'].includes(change)) assert.equal(f.reads.length, 0);
    assert.equal(JSON.stringify(result).includes('private-'), false);
  }
});
