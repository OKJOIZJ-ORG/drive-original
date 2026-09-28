'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const pin = require('../media/revision-pin.js');
const context = { fileId: 'fixture', accountKey: 'account', accountGeneration: 1 };
const metadata = { id: 'fixture', headRevisionId: 'A', size: '16', mimeType: 'video/webm', modifiedTime: 'fixed',
  sha256Checksum: 'a'.repeat(64), trashed: false, capabilities: { canDownload: true, canReadRevisions: true } };
const uri = 'https://www.googleapis.com/drive/v3/files/fixture/revisions/A?alt=media&opaqueGrant=synthetic';
const operation = { name: 'opaque/name+value', done: true, response: {
  '@type': 'type.googleapis.com/google.apps.drive.v3.DownloadFileResponse', downloadUri: uri, partialDownloadAllowed: true } };
function fixture(overrides = {}) {
  const calls = []; let current = true;
  const options = { context, isCurrent: () => current,
    async readMetadata(args) { calls.push({ type: 'metadata', phase: args.phase }); return metadata; },
    async startDownload(args) { calls.push({ type: 'download', ...args }); return operation; },
    async pollOperation(args) { calls.push({ type: 'poll', ...args }); return operation; },
    async pause(ms) { calls.push({ type: 'pause', ms }); }, ...overrides };
  return { calls, options, setCurrent(value) { current = value; } };
}
test('classic IIFE and CommonJS expose the same bounded helper surface', () => {
  const sandbox = { URL, AbortController, setTimeout, clearTimeout };
  vm.runInNewContext(fs.readFileSync(require.resolve('../media/revision-pin.js'), 'utf8'), sandbox);
  assert.equal(sandbox.DriveRevisionPin.PROTOCOL, pin.PROTOCOL);
  assert.deepEqual(Object.keys(sandbox.DriveRevisionPin).sort(), Object.keys(pin).sort());
  assert.equal(globalThis.DriveRevisionPin, pin);
});
test('first acquisition brackets empty revision POST with metadata; initialdone never polls', async () => {
  const f = fixture(); const value = await pin.acquire(f.options);
  assert.equal(value.uri, uri); assert.ok(Object.isFrozen(value) && Object.isFrozen(value.descriptor));
  assert.deepEqual(f.calls.map(c => c.type), ['metadata', 'download', 'metadata']);
  const post = f.calls[1]; assert.equal(post.method, 'POST'); assert.equal(post.body, null); assert.equal(post.revisionId, 'A');
  assert.equal(post.signal.aborted, true); assert.equal(value.descriptor.accountKey, context.accountKey);
});
test('retained A pin returns identical object without sampling latest B or new operation', async () => {
  const old = await pin.acquire(fixture().options);
  const f = fixture({ retainedPin: old, readMetadata() { throw Error('MUST_NOT_READ_LATEST_B'); }, startDownload() { throw Error('MUST_NOT_POST'); } });
  assert.equal(await pin.acquire(f.options), old);
  await assert.rejects(pin.acquire({ ...f.options, context: { ...context, accountGeneration: 2 } }), { code: 'OWNER' });
});
test('descriptor equality is canonical across property order but preserves first-checksum absence', () => {
  const d = pin.descriptor(metadata, context), reverse = Object.fromEntries(Object.entries(d).reverse());
  assert.equal(pin.sameDescriptor(d, reverse), true);
  assert.equal(pin.sameDescriptor(d, { ...reverse, sha256Checksum: null }), false);
  assert.equal(pin.sameDescriptor(null, null), false);
  const a = { protocol: pin.PROTOCOL, partialDownloadAllowed: true, descriptor: d, uri };
  assert.equal(pin.samePin(a, { ...a, descriptor: reverse }), true);
  assert.equal(pin.samePin(a, { ...a, uri: uri + '&anotherGrant=1' }), false);
});
test('all first-identity and permission changes reject before candidate is returned', async () => {
  for (const update of [{ headRevisionId: 'B' }, { size: '17' }, { mimeType: 'video/mp4' }, { modifiedTime: 'changed' },
    { sha256Checksum: 'b'.repeat(64) }, { resourceKey: 'new-key' }, { capabilities: { canDownload: true, canReadRevisions: false } },
    { capabilities: { canDownload: false } }, { trashed: true }]) {
    const f = fixture({ readMetadata: async ({ phase }) => phase === 'before' ? metadata : { ...metadata, ...update } });
    await assert.rejects(pin.acquire(f.options), e => ['CONTENT_DRIFT', 'PERMISSION'].includes(e.code));
  }
  const f = fixture({ readMetadata: async ({ phase }) => ({ ...metadata, sha256Checksum: phase === 'before' ? null : metadata.sha256Checksum }) });
  await assert.rejects(pin.acquire(f.options), { code: 'CONTENT_DRIFT' });
});
test('absent revision, document export, denied permission and malformed checksums are classified', async () => {
  for (const [update, code] of [[{ headRevisionId: null }, 'IDENTITY_UNAVAILABLE'],
    [{ mimeType: 'application/vnd.google-apps.document' }, 'UNSUPPORTED'], [{ trashed: true }, 'PERMISSION'],
    [{ capabilities: { canDownload: false } }, 'PERMISSION'], [{ sha256Checksum: 123 }, 'METADATA']]) {
    let posts = 0; const f = fixture({ readMetadata: async () => ({ ...metadata, ...update }), startDownload: async () => { posts++; return operation; } });
    await assert.rejects(pin.acquire(f.options), { code }); assert.equal(posts, 0);
  }
});
test('private provider URI rejects other origin, path, revision, credentials, fragments and duplicate alt', async () => {
  const valid = await pin.acquire(fixture().options);
  for (const bad of [uri.replace('www.googleapis.com', 'googleapis.com'), uri.replace('https:', 'http:'),
    uri.replace('/fixture/', '/other/'), uri.replace('/revisions/A', '/revisions/B'), uri.replace('/revisions/A', '/revisions/A/redirect'),
    uri.replace('/revisions/A', '/revisions/%41'), uri.replace('alt=media', 'alt=json'), uri + '&alt=media', uri + '&revisionId=B',
    uri + '&id=other', uri + '&access_token=synthetic', uri + '&Authorization=synthetic', uri + '&REFRESH_TOKEN=synthetic',
    uri + '#fragment', uri.replace('https://', 'https://user@')]) {
    assert.throws(() => pin.validatePin({ ...valid, uri: bad }, context), { code: 'URI' });
  }
  assert.equal(pin.validatePin(valid, context), valid);
  const restored = JSON.parse(JSON.stringify(valid));
  assert.equal(pin.validatePin(restored, context), restored);
  assert.ok(Object.isFrozen(restored) && Object.isFrozen(restored.descriptor));
});
test('nonpartial and invalid completed response cannot become unchecked media', async () => {
  for (const [response, code] of [[{ ...operation.response, partialDownloadAllowed: false }, 'NONPARTIAL'],
    [{ ...operation.response, '@type': 'wrong' }, 'OPERATION'], [null, 'OPERATION']]) {
    await assert.rejects(pin.acquire(fixture({ startDownload: async () => ({ ...operation, response }) }).options), { code });
  }
});
test('pending operations use fixed10s spacing, exact opaque name and at most3 polls', async () => {
  const pending = { name: operation.name, done: null };
  const f = fixture({ startDownload: async () => pending });
  await pin.acquire(f.options);
  assert.deepEqual(f.calls.filter(c => c.type === 'pause').map(c => c.ms), [10000]);
  assert.equal(f.calls.find(c => c.type === 'poll').name, operation.name);
  const g = fixture({ startDownload: async () => pending, pollOperation: async args => { g.calls.push({ type: 'poll', ...args }); return pending; } });
  await assert.rejects(pin.acquire(g.options), { code: 'PENDING_LIMIT', status: 504 });
  assert.equal(g.calls.filter(c => c.type === 'poll').length, 3);
  assert.deepEqual(g.calls.filter(c => c.type === 'pause').map(c => c.ms), [10000, 10000, 10000]);
});
test('changed operation name/resource key, invaliddone, error and responsewhilepending reject', async () => {
  const pending = { name: operation.name, done: false };
  await assert.rejects(pin.acquire(fixture({ startDownload: async () => pending,
    pollOperation: async () => ({ ...operation, name: 'changed' }) }).options), { code: 'OPERATION_NAME' });
  for (const [op, code] of [[{ ...operation, name: '' }, 'OPERATION_NAME'], [{ ...operation, name: 'bad name' }, 'OPERATION_NAME'],
    [{ ...operation, error: { code: 7 } }, 'OPERATION'], [{ ...operation, error: false }, 'OPERATION'], [{ ...operation, done: 'true' }, 'OPERATION'],
    [{ ...operation, metadata: { resourceKey: 'different' } }, 'CONTENT_DRIFT'], [{ ...operation, metadata: { '@type': 'wrong' } }, 'OPERATION'],
    [{ ...operation, done: false }, 'OPERATION']]) {
    await assert.rejects(pin.acquire(fixture({ startDownload: async () => op }).options), { code });
  }
});
test('independent wall deadline aborts a held hook without claiming it drained', async () => {
  let heldSignal, release; const held = new Promise(resolve => { release = resolve; });
  const f = fixture({ maxAcquisitionMs: 10, readMetadata: async ({ signal }) => { heldSignal = signal; return held; } });
  await assert.rejects(pin.acquire(f.options), { code: 'ACQUISITION_TIMEOUT', status: 504 });
  assert.equal(heldSignal.aborted, true); assert.equal(f.calls.length, 0);
  release(metadata); // Hook ignored cancellation; transport/body drain is caller-owned.
});
test('deadline includes pending pause and does not start a late poll', async () => {
  let pollCount = 0, waitSignal;
  const f = fixture({ maxAcquisitionMs: 10, startDownload: async () => ({ name: operation.name, done: false }),
    pause: async (_ms, signal) => { waitSignal = signal; return new Promise(resolve => signal.addEventListener('abort', resolve, { once: true })); },
    pollOperation: async () => { pollCount++; return operation; } });
  await assert.rejects(pin.acquire(f.options), { code: 'ACQUISITION_TIMEOUT' });
  assert.equal(waitSignal.aborted, true); assert.equal(pollCount, 0);
});
test('caller source abort and owner drift reject late hooks; async owner checks are invalid', async () => {
  let release; const held = new Promise(resolve => { release = resolve; }), controller = new AbortController();
  const f = fixture({ signal: controller.signal, startDownload: async () => held }); const opening = pin.acquire(f.options);
  await new Promise(resolve => setImmediate(resolve)); controller.abort();
  await assert.rejects(opening, { code: 'OWNER' }); release(operation);
  const g = fixture({ startDownload: async () => { g.setCurrent(false); return operation; } });
  await assert.rejects(pin.acquire(g.options), { code: 'OWNER' });
  await assert.rejects(pin.acquire(fixture({ isCurrent: async () => true }).options), { code: 'OWNER' });
});
test('invalid resource bounds cannot create unbounded acquisition or polls', async () => {
  for (const update of [{ maxPolls: 4 }, { maxPolls: -1 }, { maxAcquisitionMs: 40001 }, { maxAcquisitionMs: 0 }]) {
    await assert.rejects(pin.acquire(fixture(update).options), { code: 'OPTIONS' });
  }
});
test('malformed equal-looking pin or descriptor does not establish identity', () => {
  assert.equal(pin.sameDescriptor({ fileId: 'fixture' }, { fileId: 'fixture' }), false);
  const d = pin.descriptor(metadata, context), a = { protocol: pin.PROTOCOL, descriptor: d, partialDownloadAllowed: true, uri };
  assert.equal(pin.samePin(a, a), true);
  const malformed = { ...a, uri: uri + '&access_token=synthetic' };
  assert.equal(pin.samePin(malformed, malformed), false);
});
