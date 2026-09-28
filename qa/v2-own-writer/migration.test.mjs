import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { collectSnapshot, canonical } from '../v2-state-snapshot/snapshot.mjs';
import { createRecoveryBackup } from '../v2-state-recovery-backup/backup.mjs';
import { buildOwnWriterFactory } from './build-browser-factory.mjs';
import { createOwnWriterHandle } from './migration.mjs';

const appSource = fs.readFileSync(new URL('../../app.js', import.meta.url), 'utf8');
const start = appSource.indexOf('function createEmptyAccountMediaState()');
const end = appSource.indexOf('function accountFavoriteIds(', start);
assert.ok(start >= 0 && end > start);
const product = vm.createContext({});
vm.runInContext(`const ACCOUNT_STATE_SCHEMA_VERSION=1;${appSource.slice(start, end)}`, product);
const normalize = value => JSON.parse(JSON.stringify(product.normalizeAccountMediaState(value)));
const merge = (a, b) => JSON.parse(JSON.stringify(product.mergeAccountMediaStates(a, b)));
const account = 'private-synthetic-account', writer = 'private-candidate-writer';
const ownName = `drive-original-account-state-v2-${writer}.json`;
const upload = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,modifiedTime';
const rules = { normalize, merge, expectedAccountId: account };
const state = (favorites = {}, viewed = {}, updatedAt = 30) => ({ schemaVersion: 1, updatedAt, favorites, viewed });
const initial = [
  { id: 'private-legacy-doc', name: 'drive-original-account-state.json', modifiedTime: '2026-09-28T00:00:01Z', version: '1',
    raw: { updatedAt: 20, favorites: { privateTie: { liked: true, updatedAt: 20 }, privateBoolean: true }, viewed: { privateSeen: 10 }, extra: { preserve: '원문' } } },
  { id: 'private-old-doc', name: 'drive-original-account-state-v2-private-old-writer.json', modifiedTime: '2026-09-28T00:00:02Z', version: '2',
    raw: state({ privateTie: { liked: false, updatedAt: 20 } }, { privateSeen: 30 }) }
];
const source = await buildOwnWriterFactory();
function evaluate() {
  const context = vm.createContext({ AbortController, Uint8Array, TextEncoder, TextDecoder, URLSearchParams,
    setTimeout, clearTimeout, localStorage: { setItem() { assert.fail('NO_REAL_STORAGE'); }, getItem() { assert.fail('NO_REAL_STORAGE'); } },
    fetch() { assert.fail('NO_DIRECT_FETCH'); }, crypto: { randomUUID() { assert.fail('NO_UUID_CREATION'); } } });
  const keys = Object.keys(context), factory = vm.runInContext(source, context);
  assert.deepEqual(Object.keys(context), keys);
  return factory;
}
async function fixture({ readHook, dispatchHook, journalHook, lockHook, ownPresent = false } = {}) {
  const docs = structuredClone(initial), reads = [], posts = [], journal = [];
  let locked = false, running = false, ownerCurrent = true, lockSignal;
  const controller = new AbortController();
  const oldRemote = merge(normalize(initial[0].raw), normalize(initial[1].raw));
  const projection = merge(oldRemote, state({ privatePendingUnlike: { liked: false, updatedAt: 40 } }, { privatePendingSeen: 40 }, 40));
  if (ownPresent) docs.push({ id: 'already-owned', name: ownName, modifiedTime: '2026-09-28T00:00:03Z', version: '1', raw: projection });
  const candidate = { accountId: account, cacheText: ' ' + JSON.stringify(projection) + '\n', runtimeProjection: projection,
    pending: !ownPresent, writerId: writer, writerStorageText: writer };
  const legacyLocal = { privateTransport: true, origin: 'https://okjoizj-org.github.io', pathname: '/drive-original/version.json',
    accountId: account, rawText: JSON.stringify(state({ privateTie: { liked: false, updatedAt: 20 } }, { privateSeen: 10 }, 20)),
    writerId: 'private-old-writer', writerRead: true, repeatedReadsEqual: true };
  let f;
  const read = async (address, options) => {
    const url = new URL(address), phase = posts.length ? 'after' : 'before';
    if (running) assert.equal(locked, true, 'real writer-lock contract surrounds every run read');
    assert.equal(options.method, 'GET'); assert.equal(url.origin, 'https://www.googleapis.com');
    assert.ok(options.signal instanceof AbortSignal); reads.push({ url, phase });
    const route = url.pathname.endsWith('/about') ? 'account' : url.searchParams.get('alt') === 'media' ? 'body' : 'catalog';
    const custom = running && readHook ? await readHook({ f, url, route, phase, options }) : null;
    if (custom) return custom;
    if (route === 'account') return new Response(JSON.stringify({ user: { permissionId: account } }));
    if (route === 'catalog') return new Response(JSON.stringify({ files: docs.map(({ raw, ...metadata }) => metadata) }));
    const found = docs.find(file => file.id === decodeURIComponent(url.pathname.split('/').pop()));
    return new Response(JSON.stringify(found?.raw || {}), { status: found ? 200 : 404 });
  };
  const baseline = await collectSnapshot({ read, ...rules });
  const backup = createRecoveryBackup({ remoteSnapshot: baseline, candidate, legacyLocal, ...rules }).privatePayload;
  reads.length = 0;
  const deps = { backup, read, readCandidate: () => candidate, normalize, merge,
    isCurrent: () => ownerCurrent, signal: controller.signal,
    lock: async (name, options, task) => {
      assert.equal(name, `drive-original:account:${account}:${writer}`); assert.ok(options.signal instanceof AbortSignal); lockSignal = options.signal;
      if (lockHook) return lockHook({ f, name, options, task });
      assert.equal(locked, false); locked = true;
      try { return await task(); } finally { locked = false; }
    },
    journal: record => { assert.equal(locked, true); journal.push(structuredClone(record));
      return journalHook ? journalHook({ f, record }) : true; },
    dispatch: async (address, options) => {
      assert.equal(locked, true); assert.equal(address, upload); assert.equal(options.method, 'POST');
      assert.equal(options.signal, lockSignal); assert.deepEqual(Object.keys(options.headers), ['Content-Type']);
      assert.equal(journal.filter(entry => entry.stage === 'attempt_claimed').length, 1, 'durable claim precedes fetch');
      const boundary = options.headers['Content-Type'].split('boundary=')[1], parts = options.body.split('\r\n');
      assert.equal(parts[0], '--' + boundary); assert.equal(parts[8], '--' + boundary + '--');
      const metadata = JSON.parse(parts[3]), body = JSON.parse(parts[7]);
      assert.deepEqual(metadata, { name: ownName, mimeType: 'application/json', parents: ['appDataFolder'] });
      assert.equal(canonical(body), canonical(projection)); assert.equal(body.favorites.privateTie.liked, false);
      assert.equal(body.favorites.privatePendingUnlike.liked, false); assert.equal(body.viewed.privateSeen, 30);
      posts.push({ address, options, metadata, body });
      const apply = () => docs.push({ id: 'private-new-own-doc', name: ownName, modifiedTime: '2026-09-28T00:00:04Z', version: '1', raw: structuredClone(body) });
      if (dispatchHook) return dispatchHook({ f, apply, options });
      apply(); return 200;
    }
  };
  f = { docs, reads, posts, journal, backup, candidate, controller, deps,
    setCurrent: value => { ownerCurrent = value; }, get locked() { return locked; },
    start: (factory = evaluate()) => { running = true; return factory(deps); },
    run: (budgetMs, factory = evaluate()) => { running = true; return factory(deps).run(budgetMs); } };
  return f;
}

test('actual bundled canonical executor performs exact multipart POST once under one lock through full raw readback, leaving old docs/local untouched', async () => {
  const f = await fixture(); const candidate = structuredClone(f.candidate), old = structuredClone(f.docs);
  const handle = f.start(), result = await handle.run();
  assert.equal(result.passed, true); assert.equal(result.writeAttempts, 1); assert.equal(result.confirmedByIndependentRawRead, true);
  assert.equal(result.exactOwnBody, true); assert.equal(result.otherDocumentsUnchanged, true);
  assert.equal(f.posts.length, 1); assert.deepEqual(f.docs.slice(0, 2), old); assert.deepEqual(f.candidate, candidate);
  assert.deepEqual(f.journal.map(entry => entry.stage), ['attempt_claimed', 'confirmed']);
  assert.equal(f.journal[1].confirmedByIndependentRawRead, true); assert.equal(f.locked, false);
  assert.equal((await handle.run()).failure, 'already_claimed'); assert.equal(f.posts.length, 1);
  assert.equal(JSON.stringify(result).includes('private-'), false);
});

test('existing own writer, changed remote catalog/body, candidate or owner all reject before POST', async () => {
  const existing = await fixture({ ownPresent: true }); assert.equal((await existing.run()).passed, false); assert.equal(existing.posts.length, 0);
  for (const mutation of ['metadata', 'raw', 'candidate', 'owner', 'backup']) {
    const f = await fixture();
    if (mutation === 'metadata') f.docs[0].version = 'changed';
    if (mutation === 'raw') f.docs[0].raw.viewed.privateSeen++;
    if (mutation === 'candidate') f.candidate.cacheText += ' ';
    if (mutation === 'owner') f.setCurrent(false);
    if (mutation === 'backup') f.backup.remote.remote.viewed.privateSeen++;
    let result;
    try { result = await f.run(); } catch (cause) { result = { passed: false, failure: cause.code }; }
    assert.equal(result.passed, false); assert.equal(f.posts.length, 0); assert.equal(f.locked, false);
  }
});

test('journal claim failure causes zero POST; durable confirmation failure cannot become success despite canonical swallowed error', async () => {
  for (const stage of ['attempt_claimed', 'confirmed']) {
    const f = await fixture({ journalHook: ({ record }) => record.stage !== stage });
    const result = await f.run(); assert.equal(result.passed, false);
    assert.equal(result.writeAttempts, stage === 'confirmed' ? 1 : 0);
    assert.equal(f.posts.length, stage === 'confirmed' ? 1 : 0);
    assert.equal(result.confirmedByIndependentRawRead, false);
  }
});

test('lost upload response reconciles applied write by independent reads; not applied stays uncertain without replay', async () => {
  for (const applied of [true, false]) {
    const f = await fixture({ dispatchHook: ({ apply }) => { if (applied) apply(); throw new Error('synthetic response loss'); } });
    const result = await f.run(); assert.equal(result.passed, applied); assert.equal(result.writeAttempts, 1);
    assert.equal(f.posts.length, 1); assert.ok(f.reads.some(entry => entry.phase === 'after'));
    if (!applied) assert.equal(result.failure, 'submission_uncertain');
    assert.equal(f.locked, false);
  }
});

test('missing/malformed/duplicate/changed readback and old document drift remain uncertain after one POST', async () => {
  for (const change of ['missing', 'schema', 'duplicate', 'body', 'old', '404', 'account']) {
    let modified = false;
    const f = await fixture({ readHook: ({ f, route, phase }) => {
      if (phase !== 'after') return;
      if (!modified && route === 'account') {
        modified = true;
        if (change === 'missing') f.docs.pop();
        if (change === 'schema') f.docs.at(-1).raw.schemaVersion = 99;
        if (change === 'duplicate') f.docs.push({ ...structuredClone(f.docs.at(-1)), id: 'private-duplicate' });
        if (change === 'body') f.docs.at(-1).raw.favorites.privatePendingUnlike.liked = true;
        if (change === 'old') f.docs[0].raw.viewed.privateSeen++;
      }
      if (change === '404' && route === 'body') return new Response('{}', { status: 404 });
      if (change === 'account' && route === 'account') return new Response(JSON.stringify({ user: { permissionId: 'other-account' } }));
    } });
    const result = await f.run(); assert.equal(result.passed, false); assert.equal(result.failure, 'submission_uncertain');
    assert.equal(result.confirmedByIndependentRawRead, false); assert.equal(f.posts.length, 1); assert.equal(f.locked, false);
  }
});

test('owner/cancellation between durable claim and dispatch or after POST never reports false success', async () => {
  const pre = await fixture({ journalHook: ({ f }) => { f.setCurrent(false); return true; } });
  assert.equal((await pre.run()).passed, false); assert.equal(pre.posts.length, 0);
  const aborted = await fixture(); aborted.controller.abort(); assert.equal((await aborted.run()).passed, false); assert.equal(aborted.posts.length, 0);
  for (const action of ['abort', 'owner']) {
    const f = await fixture({ dispatchHook: ({ f, apply }) => { apply(); if (action === 'abort') f.controller.abort(); else f.setCurrent(false); return 200; } });
    const result = await f.run(); assert.equal(result.failure, 'submission_uncertain'); assert.equal(result.passed, false); assert.equal(f.posts.length, 1);
  }
});

test('pending dispatch and pending lock are bounded by the run budget, independently of transport cooperation', async () => {
  for (const phase of ['dispatch', 'lock']) {
    const f = await fixture(phase === 'dispatch' ? { dispatchHook: () => new Promise(() => {}) } : { lockHook: () => new Promise(() => {}) });
    let timer;
    const result = await Promise.race([f.run(40), new Promise(resolve => { timer = setTimeout(() => resolve({ hung: true }), 160); })]);
    clearTimeout(timer);
    assert.notEqual(result.hung, true, `${phase} exceeded bounded run budget`);
    assert.equal(result.passed, false); assert.equal(f.posts.length, phase === 'dispatch' ? 1 : 0);
  }
});

test('restricted write hook rejects PATCH/other URL/headers/name/body/tombstone tampering before native dispatch', async () => {
  for (const change of ['method', 'url', 'headers', 'name', 'body', 'tombstone']) {
    const f = await fixture();
    const execute = async hooks => hooks.lock(`drive-original:account:${account}:${writer}`, { signal: hooks.signal }, async () => {
      const catalog = await hooks.catalog(); hooks.remote(catalog);
      const boundary = 'drive_original_123_abc';
      const metadata = { name: ownName, mimeType: 'application/json', parents: ['appDataFolder'] };
      const body = normalize(f.candidate.runtimeProjection);
      if (change === 'name') metadata.name = 'unrelated-writer.json';
      if (change === 'tombstone') body.favorites.privateTie.liked = true;
      const parts = [`--${boundary}`, 'Content-Type: application/json; charset=UTF-8', '', JSON.stringify(metadata),
        `--${boundary}`, 'Content-Type: application/json', '', JSON.stringify(body), `--${boundary}--`, ''];
      const options = { method: change === 'method' ? 'PATCH' : 'POST', signal: hooks.signal,
        headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body: parts.join('\r\n') };
      if (change === 'headers') options.headers.Authorization = 'DO_NOT_PASS';
      if (change === 'body') options.body += 'tampered';
      await hooks.write(change === 'url' ? 'https://other.test/upload' : upload, options);
    });
    const result = await createOwnWriterHandle(f.deps, execute).run();
    assert.equal(result.passed, false); assert.equal(result.failure, 'write_policy');
    assert.equal(f.posts.length, 0); assert.equal(f.journal.length, 0);
  }
});

function extractFunction(text, name) {
  const first = text.indexOf(`async function ${name}(`); assert.ok(first >= 0);
  const body = text.indexOf(') {', first) + 2; let depth = 0;
  for (let i = body; i < text.length; i++) {
    if (text[i] === '{') depth++;
    if (text[i] === '}' && --depth === 0) return text.slice(first, i + 1);
  }
  assert.fail('canonical function boundary missing');
}
test('deterministic isolated builder embeds exact unchanged current canonical function text and does not call product storage/UUID/global fetch', async () => {
  assert.equal(source, await buildOwnWriterFactory());
  for (const name of ['createAccountStateFile', 'updateAccountStateFile', 'flushAccountMediaState']) {
    assert.equal(extractFunction(source, name), extractFunction(appSource, name), `${name} exact canonical source changed`);
  }
  assert.equal((await (await fixture()).run()).passed, true);
});
