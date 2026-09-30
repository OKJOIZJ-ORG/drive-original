import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { getEventListeners } from 'node:events';
import {build} from './build.mjs';

const built = await build();built.source=built.factory;built.appText=built.app;built.appHash=built.record.appSHA256;
const facadeText = await fs.readFile(new URL('./fresh-facade.function.js', import.meta.url), 'utf8');
const fixture = Array.from({ length: 10 }, (_, i) => ({ id: `public-state-${i}`,
  name: i === 0 ? 'drive-original-account-state.json' : `drive-original-account-state-v2-public-writer-${i}.json`,
  modifiedTime: String(i), raw: { schemaVersion: 1, updatedAt: 20 + i,
    viewed: { [`view-${i}`]: 20 + i }, favorites: { shared: { liked: i !== 6, updatedAt: 50 }, [`favorite-${i}`]: { liked: i % 2 === 0, updatedAt: 20 + i } } } }));
const plain = value => JSON.parse(JSON.stringify(value));
function context() {
  const storage = new Map(), events = new Map(), calls = [], storageWrites = [];
  const c = { AbortController, Blob, DOMException, Headers, Response, Uint8Array, TextEncoder, URL, URLSearchParams, TextDecoder, performance,
    __DRIVE_ORIGINAL_RUNTIME__: { driveMutationsEnabled: false, accountStateWritesEnabled: true },
    setTimeout, clearTimeout, setInterval, clearInterval, requestAnimationFrame() {},
    console: { log() {}, warn() {}, error() {} },
    location: { href: 'https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev/', origin: 'https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev', pathname: '/', search: '', hash: '', protocol: 'https:' },
    localStorage: { getItem: key => storage.get(key) ?? null, setItem(key, text) { storageWrites.push(key); storage.set(key, String(text)); }, removeItem(key) { storageWrites.push(key); storage.delete(key); } },
    navigator: { onLine: true, serviceWorker: { controller: { state: 'activated' } } },
    document: { visibilityState: 'visible', addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; } },
  };
  c.window = { isSecureContext: true, location: c.location, matchMedia: () => ({ matches: false }),
    addEventListener(name, fn) { if (!events.has(name)) events.set(name, new Set()); events.get(name).add(fn); },
    removeEventListener(name, fn) { events.get(name)?.delete(fn); } };
  c.self = c.window; c.top = c.window; c.matchMedia = c.window.matchMedia;
  c.fetch = async (address, options) => {
    calls.push({ url: new URL(address), options });
    const url = new URL(address);
    if (url.pathname.endsWith('/about')) return new Response(JSON.stringify({ user: { permissionId: 'public-account' } }));
    if (url.pathname === '/drive/v3/files') return new Response(JSON.stringify({ files: fixture.map(({ raw, ...meta }) => meta) }));
    const row = fixture.find(row => row.id === url.pathname.split('/').pop());
    return row ? new Response(JSON.stringify(row.raw)) : new Response('{}', { status: 404 });
  };
  vm.createContext(c); vm.runInContext(built.appText, c);
  const run = text => vm.runInContext(text, c);
  c.rows = structuredClone(fixture);
  run(`state.token='public-test-credential';state.expiresAt=Date.now()+3600000;state.tokenRevision=3;
    state.authCapabilities={version:1,driveRead:true,driveWrite:false,appData:true};state.accountId='public-account';state.authAccountKey='public-auth';state.authStatus='online';
    state.accountStateWriterId='public-current-writer';state.accountStateLoaded=true;state.accountIdentityPending=false;
    state.accountStateAbortController=new AbortController();q1RetirementResult={settled:true};
    state.accountMediaState=rows.reduce((merged,row)=>mergeAccountMediaStates(merged,row.raw),createEmptyAccountMediaState());`);
  const expected = plain(run('state.accountMediaState'));
  storage.set(run('accountStateCacheKey(state.accountId)'), JSON.stringify(expected));
  storage.set(run('ACCOUNT_WRITER_STORAGE_KEY'), 'public-current-writer');
  storageWrites.length = 0;
  const actualFactory = vm.runInContext(`(${built.source})`, c);
  const facade = vm.runInContext(`(${facadeText})`, c);
  return { c, run, expected, storage, storageWrites, events, calls, actualFactory,
    start: (factory = actualFactory, ids = fixture.map(row => row.id), budget = 30000) => facade.call(factory, expected, ids, budget, {get:()=>({controller:c.navigator.serviceWorker.controller,version:"1.22.0-rc.28",sourceCommit:built.record.source,sourceSHA256:{"app.js":built.appHash}})}),
    assertClean() { for (const name of ['pagehide', 'beforeunload']) assert.equal(events.get(name)?.size || 0, 0); assert.equal(getEventListeners(run('state.accountStateAbortController.signal'), 'abort').length, 0); },
  };
}

test('actual complete factory + facade reconstruct ten recognized documents in twelve canonical GETs without real storage/UI mutation', async () => {
  const f = context(); const beforeStorage = [...f.storage], beforeProjection = plain(f.run('state.accountMediaState'));
  const beforeKeys = Object.keys(f.c); const job = f.start(); const result = plain(await job.run()); const summary = plain(job.summary());
  assert.equal(result.passed, true); assert.equal(result.reads, 12); assert.equal(result.writes, 0); assert.equal(result.documents, 10);
  assert.equal(result.liked, 5); assert.equal(result.unliked, 6); assert.equal(result.viewed, 10);
  assert.equal(summary.nativeGets, 12); assert.equal(summary.ownerCurrent, true); assert.equal(summary.timersCleared, true);
  assert.equal(summary.actualCacheUnchanged, true); assert.equal(summary.actualWriterUnchanged, true); assert.equal(summary.sourceHash, built.appHash);
  assert.deepEqual([...f.storage], beforeStorage); assert.deepEqual(plain(f.run('state.accountMediaState')), beforeProjection); assert.deepEqual(f.storageWrites, []);
  assert.deepEqual(Object.keys(f.c), beforeKeys); assert.equal(f.run('state.accountStateLoaded'), true);
  assert.equal(f.run('state.selected'), null); assert.equal(f.run('state.accountStateSyncTimer'), null);
  for (const call of f.calls) {
    assert.equal(call.options.method, 'GET'); assert.equal(call.options.headers.Authorization, 'Bearer public-test-credential');
    assert.equal(call.options.credentials, 'omit'); assert.equal(call.options.redirect, 'error'); assert.equal(call.options.cache, 'no-store');
  }
  assert.ok(!JSON.stringify(summary).includes('public-account')); assert.ok(!JSON.stringify(summary).includes('public-state-')); assert.ok(!JSON.stringify(summary).includes('public-test-credential'));
  f.assertClean(); job.clear(); f.assertClean();
});

test('facade rejects original/arbitrary body, POST/PATCH, wrong origin/query and caller headers before native dispatch', async () => {
  const about = 'https://www.googleapis.com/drive/v3/about?fields=user(permissionId)';
  for (const [url, extra] of [
    ['https://www.googleapis.com/drive/v3/files/original-media?alt=media', {}],
    ['https://www.googleapis.com/drive/v3/files/unapproved?alt=media', {}],
    [about, { method: 'POST' }], [about, { method: 'PATCH' }],
    ['https://other.test/drive/v3/about?fields=user(permissionId)', {}],
    ['https://www.googleapis.com/drive/v3/files?spaces=drive&q=anything', {}],
    [about, { headers: { Authorization: 'untrusted' } }],
  ]) {
    const f = context(); let supplied;
    const stub = args => { supplied = args; return { run: async () => { await args.read(url, { method: 'GET', signal: args.signal, ...extra }); }, safeSummary: () => ({}), clear() {} }; };
    const job = f.start(stub); assert.equal(supplied.expectedAccountId, 'public-account');
    await assert.rejects(job.run(), { code: 'invalid_transport' }); assert.equal(f.calls.length, 0); assert.deepEqual(f.storageWrites, []);
    f.assertClean(); job.clear();
  }
});


test('revision change fails closed and capability/timer absence fails preflight',async()=>{const f=context(),job=f.start();f.run('state.tokenRevision++');assert.equal((await job.run()).code,'stale_owner');assert.equal(f.calls.length,0);job.clear();f.assertClean();for(const change of ["state.authCapabilities.appData=false","state.accountStateSyncTimer=1"]){const g=context();g.run(change);assert.throws(()=>g.start());assert.equal(g.calls.length,0);g.assertClean();}});
test('complete ten-doc raw backup retains raw metadata/local/legacy privately and no live cache write',async()=>{const f=context();f.run('for(const row of rows)state.accountStateReadCache.set(row.id,{modifiedTime:row.modifiedTime,data:normalizeAccountMediaState(row.raw)});');const original=[...f.storage],before=f.run('state.accountStateReadCache.size');const factory=vm.runInContext(await fs.readFile(new URL('./backup-factory.expression.js',import.meta.url),'utf8'),f.c),facade=vm.runInContext('('+await fs.readFile(new URL('./capture-facade.function.js',import.meta.url),'utf8')+')',f.c);const legacy={privateTransport:true,origin:'https://okjoizj-org.github.io',pathname:'/drive-original/version.json',accountId:'public-account',rawText:JSON.stringify(fixture[0].raw),writerId:'public-legacy-writer',writerRead:true,repeatedReadsEqual:true};const proof={get:()=>({controller:f.c.navigator.serviceWorker.controller,version:'1.22.0-rc.28',sourceCommit:built.record.source,sourceSHA256:{'app.js':built.appHash}})};const handle=facade.call(factory,legacy,proof);await handle.settled();const poll=plain(handle.poll());assert.equal(poll.summary.passed,true);assert.equal(poll.summary.remoteFiles,10);assert.equal(poll.summary.projectClientBindingVerified,false);const text=handle.privateText(),envelope=handle.privateEnvelope();assert.equal(envelope.remote.files.length,10);assert.ok(!text.includes('public-test-credential'));assert.ok(!JSON.stringify(poll).includes('public-state-'));assert.equal(handle.verifyReread(text).rereadEquivalent,true);assert.deepEqual([...f.storage],original);assert.equal(f.run('state.accountStateReadCache.size'),before);assert.deepEqual(f.storageWrites,[]);f.assertClean();handle.clear();assert.throws(()=>handle.privateText());});

test('transport request/byte budgets and abort bound hostile readers without ambient operations',async()=>{const adapterText=await fs.readFile(new URL('./read-adapter.function.js',import.meta.url),'utf8');let calls=0;const c={URL,Response,TextDecoder,Uint8Array,ACCOUNT_STATE_READ:Symbol('read'),driveFetch:async()=>{calls++;return new Response(JSON.stringify({user:{permissionId:'fixture'}}));}};vm.createContext(c);const make=vm.runInContext('('+adapterText+')',c),abort=new AbortController(),adapter=make(()=>true,abort.signal,[]),options={method:'GET',signal:abort.signal},about='https://www.googleapis.com/drive/v3/about?fields=user(permissionId)';for(let i=0;i<80;i++)await adapter.read(about,options);await assert.rejects(adapter.read(about,options),{code:'request_limit'});assert.equal(calls,80);c.driveFetch=async()=>new Response('x'.repeat(8*1024*1024+1));const huge=make(()=>true,abort.signal,[]);await assert.rejects(huge.read(about,options),{code:'byte_limit'});c.driveFetch=()=>new Promise(()=>{});const pending=make(()=>true,abort.signal,[]).read(about,options);abort.abort();await assert.rejects(pending,{code:'cancelled'});});
