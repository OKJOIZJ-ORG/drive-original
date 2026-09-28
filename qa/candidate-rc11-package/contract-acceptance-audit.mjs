import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { AccountCredentialOwner } from '../../auth/session-owner.mjs';
import { refreshGoogleAccess } from '../../worker/google.mjs';

// Local actual-owner contracts only. Every provider is synthetic; no real fetch,
// browser, account, storage directory, media bytes or credential is inspected.
const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const candidateSource = 'b9d873926e894bb89a9faa8e638f7f0a80c0eb7e';
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const read = relative => fs.readFileSync(path.join(sourceRoot, relative));
const producerPath = 'qa/candidate-rc11-package/contract-acceptance-audit.mjs';
const outputPath = 'qa/candidate-rc11-package/contract-acceptance-results.json';
const checkedSources = [
  'sw.js', 'app.js', 'auth/session-owner.mjs', 'worker/google.mjs',
  'tests/sw.test.js', 'tests/mutations.test.js',
];
const sources = checkedSources.map(relative => {
  const bytes = read(relative);
  const fixed = execFileSync('git', ['show', `${candidateSource}:${relative}`], { cwd: sourceRoot });
  const lfNormalizedEqual = bytes.toString().replaceAll('\r\n', '\n') === fixed.toString().replaceAll('\r\n', '\n');
  assert.equal(lfNormalizedEqual, true, `${relative}: candidate source changed`);
  return { path: relative, sha256: sha256(bytes), fixedGitSha256: sha256(fixed), byteEqual: bytes.equals(fixed), lfNormalizedEqual };
});

// Reuse the maintained VM factory, without registering or replaying its tests.
function fixtureHelpers(relative, exports) {
  const filename = path.join(sourceRoot, relative);
  const text = read(relative).toString();
  const boundary = text.search(/\r?\ntest\(/u);
  assert.ok(boundary > 0, `${relative}: first test boundary missing`);
  const prefix = text.slice(0, boundary);
  const context = {
    require: createRequire(filename), __dirname: path.dirname(filename),
    URL, URLSearchParams, Headers, Request, Response, ReadableStream, Blob,
    Buffer, AbortController, DOMException, setTimeout, clearTimeout,
    setInterval, clearInterval, setImmediate, queueMicrotask, console, performance,
    fetch() { throw new Error('Network is forbidden in contract acceptance'); },
  };
  vm.createContext(context);
  vm.runInContext(`${prefix}\nglobalThis.contractHelpers={${exports.join(',')}};`, context, { filename });
  return { helpers: context.contractHelpers, provenance: { path: relative, prefixSha256: sha256(prefix), boundaryCharacter: boundary, exported: exports } };
}

const sw = fixtureHelpers('tests/sw.test.js', ['createWorker']);
const results = [];
const rangeCases = [
  { name: 'exact0-1', range: 'bytes=0-1', start: 0, end: 1 },
  { name: 'open', range: 'bytes=4-', start: 4, end: 15 },
  { name: 'suffix', range: 'bytes=-3', start: 13, end: 15 },
  { name: 'last-byte', range: 'bytes=15-15', start: 15, end: 15 },
];
for (const item of rangeCases) {
  const body = Uint8Array.from({ length: item.end - item.start + 1 }, (_, index) => item.start + index);
  const contentRange = `bytes ${item.start}-${item.end}/16`;
  const worker = sw.helpers.createWorker(async (_url, options) => {
    assert.equal(options.method, 'GET');
    assert.equal(new Headers(options.headers).get('Range'), item.range);
    return new Response(body, { status: 206, headers: { 'Content-Range': contentRange, 'Content-Length': String(body.length) } });
  });
  const messages = worker.addClient('A');
  worker.setToken('A', 'synthetic');
  const response = await worker.request('A', { range: item.range, size: '16' }).response;
  assert.equal(response.status, 206);
  assert.equal(response.headers.get('Content-Range'), contentRange);
  assert.equal(response.headers.get('Content-Length'), String(body.length));
  assert.equal(response.headers.get('Accept-Ranges'), 'bytes');
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), body);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(worker.calls.length, 1);
  assert.equal(messages.filter(message => message.type === 'MEDIA_PROXY_STATUS').length, 1);
  assert.equal(messages.some(message => message.type === 'MEDIA_PROXY_ERROR'), false);
  results.push({ id: `QA-TR-04/${item.name}`, passed: true, range: item.range, contentRange, bytes: body.length, syntheticProviderCalls: 1 });
}

// This is the literal rerunnable version of the earlier in-memory AU08 check.
// The Google response validator and durable credential owner are the real code.
const refreshCases = [
  ['omitted-refresh', { token_type: 'Bearer', access_token: 'new-access', expires_in: 3600 }, true],
  ['missing-access', { token_type: 'Bearer', expires_in: 3600 }, false],
  ['missing-expiry', { token_type: 'Bearer', access_token: 'new-access' }, false],
  ['missing-type', { access_token: 'new-access', expires_in: 3600 }, false],
  ['empty-refresh', { token_type: 'Bearer', access_token: 'new-access', expires_in: 3600, refresh_token: '' }, false],
];
for (const [name, payload, valid] of refreshCases) {
  const storage = { state: {}, async transaction(fn) {
    const next = structuredClone(this.state); const value = fn(next);
    this.state = next; return structuredClone(value);
  } };
  const clock = () => 1000000;
  let counter = 0, calls = 0;
  const owner = new AccountCredentialOwner({
    storage, account: 'fixture-account', clock,
    random: () => String(++counter).padStart(64, '0'),
    hash: async value => `hash:${value}`, encrypt: async value => `encrypted:${value}`,
    decrypt: async value => value.slice('encrypted:'.length),
    scheduleAlarm: async () => {}, sleep: async () => {}, revoke: async () => true,
    refresh: args => refreshGoogleAccess({
      ...args, clientId: 'fixture-client', clientSecret: 'fixture-secret', clock,
      fetchImpl: async () => { calls++; return new Response(JSON.stringify(payload), { headers: { 'Content-Type': 'application/json' } }); },
    }),
  });
  const session = await owner.establishVerifiedSession({
    account: 'fixture-account', accessToken: 'old-access', expiresAt: 4600000, refreshToken: 'preserved-refresh',
  });
  if (valid) {
    const next = await owner.credential({ sessionId: session.sessionId, rejectedRevision: session.credential.revision });
    assert.equal(next.accessToken, 'new-access'); assert.equal(next.revision, session.credential.revision + 1);
  } else {
    await assert.rejects(owner.credential({ sessionId: session.sessionId, rejectedRevision: session.credential.revision }), error => error.code === 'auth_unavailable');
  }
  assert.equal(storage.state.encryptedRefresh, 'encrypted:preserved-refresh');
  assert.equal(storage.state.lease, undefined); assert.equal(calls, 1);
  results.push({ id: `QA-AU-08/${name}`, passed: true, refreshPreserved: true, syntheticProviderCalls: calls, incompleteClassified: !valid });
}

// Existing retained tests cover404. Add the permission-loss clause specifically:
// an applied PATCH followed by403 readback stays uncertain and never replays.
const mutations = fixtureHelpers('tests/mutations.test.js', ['client', 'remote']);
const client = mutations.helpers.client();
const remote = mutations.helpers.remote(client);
const syntheticFetch = client.fetch;
client.fetch = (url, options = {}) => {
  if ((options.method || 'GET') === 'GET' && remote.patches().length) {
    return Promise.resolve(Response.json({ error: { message: 'synthetic permission loss' } }, { status: 403 }));
  }
  return syntheticFetch(url, options);
};
await assert.rejects(client.run('trashDriveFile(item)'), error => error.mutationState === 'uncertain');
assert.equal(remote.patches().length, 1);
assert.equal(remote.item.trashed, true);
assert.equal(client.entries()[0].state, 'uncertain');
assert.equal(client.entries()[0].after, null);
await client.run('recoverDriveMutations()');
assert.equal(remote.patches().length, 1);
assert.equal(client.entries()[0].state, 'uncertain');
results.push({ id: 'QA-MU-08/permission-loss403', passed: true, remoteApplied: true, state: 'uncertain', patches: 1, recoveryReplayed: false });

const report = {
  schemaVersion: 1, recordedAt: new Date().toISOString(),
  candidateSource, version: '1.22.0-rc.11', node: process.version, platform: process.platform,
  scope: 'Local actual-source contract fixtures; synthetic providers and file revisions only; no physical or live Google proof',
  producer: { path: producerPath, sha256: sha256(read(producerPath)) },
  sources, helperProvenance: [sw.provenance, mutations.provenance],
  passed: results.length, failed: 0, results, networkRequests: 0,
  browserActions: 0, privateFilesRead: 0, realMutations: 0,
};
fs.writeFileSync(path.join(sourceRoot, outputPath), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ outputPath, passed: report.passed, failed: report.failed, producerSha256: report.producer.sha256 }));
