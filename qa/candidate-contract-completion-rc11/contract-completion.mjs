import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Fixed candidate only, even while another authorized unit changes workspace AUTH.
// All state, files and providers below are synthetic. No network or real writes.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const candidate = 'b9d873926e894bb89a9faa8e638f7f0a80c0eb7e';
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const snapshots = new Map();
function fixed(relative) {
  relative = relative.replaceAll('\\', '/');
  if (!snapshots.has(relative)) snapshots.set(relative, execFileSync('git', ['show', `${candidate}:${relative}`], { cwd: root }));
  return snapshots.get(relative);
}
function fixture(relative, exports = [], register = false) {
  const filename = path.join(root, relative), nativeRequire = createRequire(filename);
  const body = fixed(relative).toString();
  const boundary = body.search(/\r?\ntest\(/u);
  const prefix = register ? body : body.slice(0, boundary);
  assert.ok(register || boundary > 0);
  const tests = [];
  const context = {
    require(name) {
      if (name === 'node:test') return (name, options, callback) => tests.push({ name, fn: callback || options });
      if (name === 'node:fs') return { ...fs, readFileSync(filename, encoding) {
        const relative = path.relative(root, filename);
        assert.ok(!relative.startsWith('..'), 'fixed-source fixture read escaped repository');
        const bytes = fixed(relative);
        return encoding ? bytes.toString(typeof encoding === 'string' ? encoding : encoding.encoding) : bytes;
      } };
      return nativeRequire(name);
    },
    __dirname: path.dirname(filename), URL, URLSearchParams, Headers, Request, Response,
    ReadableStream, Blob, Buffer, AbortController, DOMException, Date,
    setTimeout, clearTimeout, setInterval, clearInterval, setImmediate,
    queueMicrotask, console, performance,
    fetch() { throw new Error('Real network forbidden in fixed candidate contract audit'); },
  };
  vm.createContext(context);
  vm.runInContext(`${prefix}\nglobalThis.helpers={${exports.join(',')}}`, context, { filename });
  return { helpers: context.helpers, tests };
}
const results = [];
async function check(id, name, fn, source = null) {
  const started = performance.now();
  try { const observation = await fn(); results.push({ id, name, passed: true, source, observation, durationMs: Math.round(performance.now() - started) }); }
  catch (error) { results.push({ id, name, passed: false, source, error: { name: error.name, message: error.message }, durationMs: Math.round(performance.now() - started) }); }
}
const selections = {
  'tests/app.test.js': [
    ['QA-SE-03', 'QA-TR-11 a native memory Blob allocation failure stays storage-limited'],
    ['QA-SE-03', 'QA-TR-11 mid-write OPFS quota cleans its lease and ends as storage-limited'],
    ['QA-SE-03', 'video playback failures distinguish retryable network errors from codec failures'],
  ],
  'tests/acceptance.test.js': [
    ['QA-ST-01', 'two continuously visible clients receive independent concurrent edits without refocus or reload'],
    ['QA-ST-01', 'foreground polling stops for hidden, offline, expired, demo and unverified sessions'],
  ],
  'tests/account-state.test.js': [
    ['QA-SE-01', 'separate state gate permits canonical own PATCH and CREATE while generic, fake marker and foreign PATCH never transmit a mutation'],
    ['QA-SE-03', 'invalid cache, quota persistence failure, unsafe raw schema/catalog and missing writer body block writes and preserve local data'],
    ['QA-ST-02', 'fresh origin reconstructs complete writer union, unlike tie and maximum viewed; normal two-writer writes converge'],
  ],
  'tests/audit.test.js': [['QA-SE-03', 'cache reset leaves sibling application caches and workers intact']],
  'tests/sw.test.js': [
    ['QA-SE-01', 'credentials and CLEAR_TOKEN are scoped to the source client'],
    ['QA-SE-01', 'missing client identity fails closed without borrowing another client token'],
    ['QA-SE-01', 'unsafe or malformed media ranges are rejected before credential and Drive access'],
    ['QA-SE-02', 'opt-in media trace correlates credential, headers, first byte and body completion without secrets'],
    ['QA-SE-03', 'truncated 206 EOF is a body-length error, never a first-byte timeout'],
    ['QA-SE-03', 'an oversized 206 chunk is rejected before any byte reaches the consumer'],
    ['QA-SW-01', 'an old page affirmative Q1 token reply without retirement capability cannot start upstream transport'],
    ['QA-SW-01', 'worker restart resolves only the requesting client and requires the correlated response'],
  ],
  'tests/shell.test.js': [
    ['QA-SW-01', 'shell cache normalizes versioned asset URLs but excludes version checks and sibling routes'],
    ['QA-SW-01', 'offline first launch resolves canonical preinstalled assets'],
    ['QA-SE-03', 'cache quota errors do not discard valid network bytes'],
    ['QA-SW-01', 'temporary server failures use the owned cached shell instead of an error document'],
  ],
  'tests/mutations.test.js': [
    ['QA-MU-05', 'batch preserves earlier confirmed origin items when a later submission changes account'],
    ['QA-MU-07', 'shortcut mutation stays on selected ID, and move removes verified parents only'],
  ],
};
for (const [source, selected] of Object.entries(selections)) {
  const registered = fixture(source, [], true).tests;
  for (const [id, name] of selected) {
    const test = registered.find(test => test.name === name);
    assert.ok(test, `${source}: selected test missing: ${name}`);
    await check(id, name, () => test.fn(), source);
  }
}

const state = fixture('tests/account-state.test.js', ['client', 'drive', 'writerFile', 'status']).helpers;
await check('QA-ST-02', 'offline like/unlike/viewed survives failed transport and merges concurrent writer on reconnect', async () => {
  const remote = state.drive([state.writerFile()]);
  let connected = true, offlineAttempts = 0;
  const client = state.client((...args) => {
    if (!connected) { offlineAttempts++; throw new TypeError('synthetic offline'); }
    return remote.request(...args);
  });
  await client.run('flushAccountMediaState()');
  const before = JSON.stringify([...remote.files]); const writesBefore = remote.writes().length;
  connected = false; client.navigator.onLine = false;
  client.run("setFavoriteFile('offline-like',true);setFavoriteFile('liked',false);markFileViewed('offline-viewed');");
  await client.run('flushAccountMediaState()');
  assert.equal(JSON.stringify([...remote.files]), before);
  assert.equal(remote.writes().length, writesBefore);
  assert.ok(offlineAttempts > 0); assert.equal(state.status(client).failed, true);
  const other = state.writerFile('other', 'device-b', { schemaVersion: 1, updatedAt: 50, favorites: { concurrent: { liked: true, updatedAt: 50 } }, viewed: { concurrent: 50 } });
  remote.files.set(other.id, other); const otherBefore = JSON.stringify(other);
  connected = true; client.navigator.onLine = true;
  await client.run('flushAccountMediaState()');
  const projection = state.status(client).projection;
  assert.equal(projection.favorites['offline-like'].liked, true);
  assert.equal(projection.favorites.liked.liked, false);
  assert.equal(projection.favorites.concurrent.liked, true);
  assert.ok(projection.viewed['offline-viewed'] > 0); assert.equal(projection.viewed.concurrent, 50);
  assert.equal(state.status(client).failed, false);
  assert.equal(JSON.stringify(remote.files.get('other')), otherBefore);
  assert.deepEqual(remote.files.get('own').data, projection);
  return { offlineAttempts, offlineRemoteWrites: 0, reconnectWrites: remote.writes().length - writesBefore, unlikeTombstone: true, otherWriterUnchanged: true };
});

const mutation = fixture('tests/mutations.test.js', ['client']).helpers;
await check('QA-MU-05', 'expiry after one confirmed item retains results and later account cannot replay origin batch', async () => {
  const client = mutation.client(); let patches = 0;
  const files = new Map(['first', 'second', 'third'].map(id => [id, { id, parents: ['old'], version: '1', trashed: false, capabilities: { canTrash: true } }]));
  client.fetch = async (address, options = {}) => {
    const file = files.get(new URL(address).pathname.split('/').pop());
    if (options.method === 'PATCH') { patches++; file.trashed = true; file.version = '2'; }
    return Response.json(file);
  };
  client.expire = () => client.run('state.token=null;state.expiresAt=0;state.authGeneration++;state.driveSessionGeneration++;');
  const rows = await client.run(`(async()=>{const owner=captureAccountStateRequest();return runTaskPool(['first','second','third'],async id=>{
    owner.assert();const result=await trashDriveFile({id,parents:['old'],version:'1'});if(id==='first')expire();return result;
  },1)})()`);
  assert.deepEqual(Array.from(rows, row => row.status), ['fulfilled', 'rejected', 'rejected']);
  assert.equal(patches, 1); assert.equal(client.entries()[0].state, 'confirmed');
  client.run("state.accountId='drive-account-B';state.authAccountKey='server-account-B';state.token='new-account-synthetic';state.expiresAt=Date.now()+3600000;");
  await client.run('recoverDriveMutations()');
  assert.equal(patches, 1); assert.equal(files.get('second').trashed, false); assert.equal(files.get('third').trashed, false);
  assert.equal(client.entries()[0].accountKey, 'server-account-A');
  return { patches, results: Array.from(rows, row => row.status), originRecordPreserved: true, replayByNewAccount: 0 };
});

await check('QA-MU-07', 'same-name shared-drive shortcut moves selected ID only, preserving sibling and shortcut target', async () => {
  const client = mutation.client(), calls = [];
  const files = new Map([
    ['synthetic-file', { id: 'synthetic-file', name: 'same-name', driveId: 'shared-drive', mimeType: 'application/vnd.google-apps.shortcut', shortcutDetails: { targetId: 'target-original' }, parents: ['old'], version: '1', trashed: false, capabilities: { canMoveItemWithinDrive: true, canMoveItemOutOfDrive: true } }],
    ['sibling', { id: 'sibling', name: 'same-name', parents: ['old'], version: '1' }],
    ['target-original', { id: 'target-original', name: 'same-name', parents: ['old'], version: '1' }],
    ['destination', { id: 'destination', name: 'same-name', driveId: 'shared-drive', mimeType: 'application/vnd.google-apps.folder', parents: ['root'], trashed: false, capabilities: { canAddChildren: true } }],
  ]);
  const before = JSON.stringify([files.get('sibling'), files.get('target-original')]);
  client.fetch = async (address, options = {}) => {
    const url = new URL(address), id = url.pathname.split('/').pop(), file = files.get(id);
    calls.push({ id, method: options.method || 'GET', supportsAllDrives: url.searchParams.get('supportsAllDrives') });
    assert.ok(file, 'unknown fixture ID');
    if (options.method === 'PATCH') { assert.equal(id, 'synthetic-file'); assert.equal(url.searchParams.get('removeParents'), 'old'); assert.equal(url.searchParams.get('addParents'), 'destination'); file.parents = ['destination']; file.version = '2'; }
    return Response.json(file);
  };
  await client.run('moveDriveFile(item,target)');
  assert.equal(JSON.stringify([files.get('sibling'), files.get('target-original')]), before);
  assert.equal(calls.filter(call => call.method === 'PATCH').length, 1);
  assert.ok(calls.every(call => ['synthetic-file', 'destination'].includes(call.id)));
  assert.ok(calls.every(call => call.supportsAllDrives === 'true'));
  assert.equal(client.entries()[0].state, 'confirmed');
  return { selectedId: 'synthetic-file', patchCount: 1, siblingAndTargetUnchanged: true, supportsAllDrives: true };
});

const sw = fixture('tests/sw.test.js', ['createWorker']).helpers;
await check('QA-SE-01', 'path/URL injection fails before provider; arbitrary unauthorized ID remains denied', async () => {
  for (const fileId of ['bad%2Fid', 'https%3A%2F%2Fevil.test', 'bad%3Falt%3Dmedia']) {
    const worker = sw.createWorker(() => { throw new Error('injection reached provider'); }); worker.addClient('A'); worker.setToken('A', 'synthetic');
    const response = await worker.request('A', { fileId }).response;
    assert.equal(response.status, 400); assert.equal(worker.calls.length, 0);
  }
  const worker = sw.createWorker((address) => { assert.equal(new URL(address).hostname, 'www.googleapis.com'); return Response.json({ error: { message: 'synthetic denied' } }, { status: 403 }); });
  worker.addClient('A'); worker.setToken('A', 'synthetic');
  const response = await worker.request('A', { fileId: 'unauthorized-arbitrary-id' }).response;
  assert.equal(response.status, 403); assert.equal(worker.calls.length, 1);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  return { injectedPathsDenied: 3, unauthorizedIdStatus: 403, provider: 'synthetic authorization denial' };
});

const shell = fixture('tests/shell.test.js', ['worker']).helpers;
await check('QA-SW-01', 'new worker activation removes old owned cache only; old-version offline shell and API/media exclusion remain safe', async () => {
  const deleted = [], installed = [], put = [], cache = { async addAll(files) { installed.push(...files); }, async match() { return new Response('baseline cached shell'); }, async put(key) { put.push(key); } };
  const worker = shell.worker(async () => { throw new TypeError('synthetic offline'); }, cache);
  worker.c.self.skipWaiting = () => {}; worker.c.self.clients = { async claim() {} };
  worker.c.caches.keys = async () => ['drive-original-shell-old', 'drive-original-shell-1.22.0-rc.11', 'sibling-app-cache'];
  worker.c.caches.delete = async key => { deleted.push(key); return true; };
  let completion;
  worker.listeners.get('install')({ waitUntil(promise) { completion = promise; } }); await completion;
  worker.listeners.get('activate')({ waitUntil(promise) { completion = promise; } }); await completion;
  assert.deepEqual(deleted, ['drive-original-shell-old']);
  assert.ok(installed.every(file => !/__drive_media|auth\/|googleapis|memory\/|qa\//.test(file)));
  assert.equal(await (await worker.run("networkFirstAsset(new Request('https://app.test/drive-original/app.js?v=old'))")).text(), 'baseline cached shell');
  for (const url of ['https://app.test/drive-original/auth/credential', 'https://app.test/drive-original/__drive_media/private-id', 'https://www.googleapis.com/drive/v3/files/private-id', 'https://app.test/sibling/app.js']) assert.equal(worker.c.shellAssetCacheKey(new Request(url)), null);
  assert.equal(put.length, 0);
  return { installedPublicAssets: installed.length, deleted, siblingPreserved: true, offlineOldVersionQuery: true, apiMediaCacheEntries: 0 };
});

const producer = 'qa/candidate-contract-completion-rc11/contract-completion.mjs';
const report = { schemaVersion: 1, recordedAt: new Date().toISOString(), candidate, scope: 'Fixed Git baseline actual app/SW VM behavior with synthetic providers only; no physical device, Google, normal mutation UI, production or mutable AUTH qualification.', producer: { path: producer, sha256: sha(fs.readFileSync(path.join(root, producer))) }, sources: [...snapshots].map(([path, bytes]) => ({ path, fixedGitSha256: sha(bytes) })), selectedRetainedTests: Object.values(selections).flat().length, results, passed: results.filter(row => row.passed).length, failed: results.filter(row => !row.passed).length };
fs.writeFileSync(path.join(root, 'qa/candidate-contract-completion-rc11/results.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ passed: report.passed, failed: report.failed, failedCases: results.filter(row => !row.passed).map(({ id, name, error }) => ({ id, name, error })) }));
process.exitCode = report.failed ? 1 : 0;
