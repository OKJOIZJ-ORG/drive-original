'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
const run = '11111111-1111-4111-8111-111111111111';
const ledgerKey = `drive-original.qa.disposable.${run}.recovery`;
const clone = value => JSON.parse(JSON.stringify(value));

// Canonical app code runs unchanged; only storage, locks, clock and HTTP are synthetic.
function client() {
  const storage = new Map(), calls = [], files = new Map();
  const roles = [['folder-a', 'folder-a'], ['folder-b', 'folder-b'], ['image-one', 'test-image-1'], ['image-two', 'test-image-2']];
  for (const [id, role] of roles) files.set(id, { id, mimeType: role.startsWith('folder') ? 'application/vnd.google-apps.folder' : 'image/png',
    parents: [role.startsWith('folder') ? 'qa-root' : 'folder-a'], version: '1', trashed: false, ownedByMe: true,
    appProperties: { qaRun: run, qaRole: role }, capabilities: { canTrash: true, canMoveItemWithinDrive: true, canAddChildren: true } });
  const ledger = { schema: 1, run, accountKey: 'account-key', accountId: 'account-id',
    planned: roles.map(([id, role]) => ({ id, role, sent: true })),
    created: roles.map(([id, role]) => ({ id, role, metadata: clone(files.get(id)) })), events: [] };
  storage.set(ledgerKey, JSON.stringify(ledger));
  const c = { AbortController, Blob, DOMException, Headers, URL, URLSearchParams, Response, console, performance,
    setTimeout, clearTimeout, setInterval, clearInterval, requestAnimationFrame() {},
    __DRIVE_ORIGINAL_RUNTIME__: { driveMutationsEnabled: false, accountStateWritesEnabled: true },
    location: { href: 'https://candidate.test/', origin: 'https://candidate.test', pathname: '/', search: '' },
    navigator: { onLine: true, serviceWorker: { controller: { scriptURL: 'https://candidate.test/sw.js' } },
      locks: { async request(_key, task) { return task(); } } },
    localStorage: { get length() { return storage.size; }, key(i) { return [...storage.keys()][i] ?? null; },
      getItem(key) { return storage.get(key) ?? null; }, setItem(key, value) { storage.set(key, String(value)); } },
    document: { addEventListener() {}, querySelectorAll() { return []; }, visibilityState: 'visible' } };
  const listeners = new Map();
  c.window = { addEventListener(type, listener) {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type).add(listener);
  }, removeEventListener(type, listener) { listeners.get(type)?.delete(listener); },
    matchMedia: () => ({ matches: false }), location: c.location };
  c.lifecycleListeners = type => listeners.get(type)?.size || 0;
  c.lifecycle = type => { for (const listener of [...(listeners.get(type) || [])]) listener({ type, persisted: true }); };
  c.matchMedia = c.window.matchMedia;
  c.fetch = async (url, options = {}) => {
    const u = new URL(url), method = options.method || 'GET', id = u.pathname.split('/').pop();
    calls.push({ method, url, options });
    if (c.hook) await c.hook({ method, id, u, options });
    if (method === 'PATCH') {
      const file = files.get(id); const body = JSON.parse(options.body);
      if (body.trashed === true) file.trashed = true;
      if (u.searchParams.has('addParents')) file.parents = [u.searchParams.get('addParents')];
      file.version = String(Number(file.version) + 1);
      for (const folderId of ['folder-a', 'folder-b']) files.get(folderId).version = String(Number(files.get(folderId).version) + 1);
      if (c.losePatch) throw new TypeError('synthetic response loss');
      return Response.json(file);
    }
    if (id === 'files') {
      const parent = /^'([^']+)'/.exec(u.searchParams.get('q'))?.[1];
      return Response.json(c.children || { incompleteSearch: false, files: [...files.values()]
        .filter(file => !file.trashed && file.parents.includes(parent)).map(file => ({ id: file.id })) });
    }
    return Response.json(files.get(id));
  };
  vm.createContext(c); vm.runInContext(source, c);
  c.run = text => vm.runInContext(text, c);
  c.run(`state.accountId='account-id';state.authAccountKey='account-key';state.accountIdentityPending=false;
    showToast=()=>{};
    state.token='synthetic';state.tokenRevision=7;state.expiresAt=Date.now()+3600000;
    state.authCapabilities={version:1,driveRead:true,driveWrite:true,appData:true};
    state.moveFolderRows=[];const item={id:'image-one',parents:['folder-a'],version:'1',mimeType:'image/png'};
    const item2={id:'image-two',parents:['folder-a'],version:'1',mimeType:'image/png'};
    const target={id:'folder-b'};let lease;`);
  c.activate = () => c.run(`lease=activateDisposableDriveMutationLease({run:'${run}',fileIds:['image-one','image-two'],targetIds:['folder-b'],sourceVersion:APP_VERSION});`);
  c.patches = () => calls.filter(call => call.method === 'PATCH');
  c.files = files; c.storage = storage; c.calls = calls;
  return c;
}

test('normal canonical two-item move then trash works with global flag false and advancing folder versions', async () => {
  const c = client(); c.activate();
  for (const item of ['item', 'item2']) await c.run(`moveDriveFile(${item},target)`);
  for (const item of ['item', 'item2']) await c.run(`trashDriveFile(${item})`);
  assert.equal(c.run('DRIVE_MUTATIONS_ENABLED'), false);
  assert.equal(c.patches().length, 4);
  assert.ok(c.files.get('image-one').trashed && c.files.get('image-two').trashed);
  const ledger = JSON.parse(c.storage.get(ledgerKey));
  assert.equal(ledger.created.find(row => row.id === 'image-one').metadata.version, '3');
  assert.ok(c.patches().every(call => Reflect.ownKeys(call.options).every(key => typeof key !== 'symbol')));
  c.run('lease.close()');
  await assert.rejects(c.run('trashDriveFile(item)'));
});

test('lost PATCH response still confirms by independent GET without replay', async () => {
  const c = client(); c.activate(); c.losePatch = true;
  await c.run('moveDriveFile(item,target)');
  assert.equal(c.patches().length, 1);
  assert.equal(c.calls.at(-1).method, 'GET');
  c.run('lease.close()');
  await c.run('recoverDriveMutations()');
  assert.equal(c.patches().length, 1);
});

for (const fault of ['tag', 'role', 'owner', 'shared-drive', 'version', 'parents', 'folder-version', 'folder-tag', 'folder-capability', 'folder-write', 'unknown-child', 'pagination', 'incomplete']) {
  test(`fresh admission rejects ${fault} before any PATCH`, async () => {
    const c = client(); c.activate(); const file = c.files.get('image-one'), folder = c.files.get('folder-b');
    if (fault === 'tag') file.appProperties.qaRun = 'foreign-run';
    if (fault === 'role') file.appProperties.qaRole = 'original';
    if (fault === 'owner') file.ownedByMe = false;
    if (fault === 'shared-drive') file.driveId = 'shared';
    if (fault === 'version') file.version = '2';
    if (fault === 'parents') file.parents = ['other-folder'];
    if (fault === 'folder-version') folder.version = '0';
    if (fault === 'folder-tag') folder.appProperties.qaRole = 'other';
    if (fault === 'folder-capability') folder.capabilities.canAddChildren = false;
    if (fault === 'folder-write') c.run("item.id='folder-a'");
    if (fault === 'unknown-child') c.children = { incompleteSearch: false, files: [{ id: 'original-media' }] };
    if (fault === 'pagination') c.children = { incompleteSearch: false, files: [], nextPageToken: 'more' };
    if (fault === 'incomplete') c.children = { incompleteSearch: true, files: [] };
    await assert.rejects(c.run('moveDriveFile(item,target)'));
    assert.equal(c.patches().length, 0);
  });
}

for (const fault of ['uncreated', 'unsent', 'arbitrary-member', 'wrong-account', 'raw-metadata', 'missing-write-grant']) {
  test(`lease rejects ${fault} without creating a transport allowance`, async () => {
    const c = client(); const ledger = JSON.parse(c.storage.get(ledgerKey));
    if (fault === 'uncreated') ledger.created.pop();
    if (fault === 'unsent') ledger.planned.at(-1).sent = false;
    if (fault === 'arbitrary-member') ledger.created.at(-1).id = 'original-media';
    if (fault === 'wrong-account') ledger.accountId = 'foreign';
    if (fault === 'raw-metadata') delete ledger.created.at(-1).metadata.appProperties;
    if (fault === 'missing-write-grant') c.run('state.authCapabilities.driveWrite=false');
    c.storage.set(ledgerKey, JSON.stringify(ledger));
    assert.throws(c.activate);
    await assert.rejects(c.run("driveFetch(DRIVE_API+'/files/image-one',{method:'PATCH',body:'{\"trashed\":true}'})"));
    assert.equal(c.patches().length, 0);
  });
}

for (const fault of ['account', 'revision', 'token', 'controller', 'source-url', 'abort', 'deadline']) {
  test(`lease rejects ${fault} change before dispatch`, async () => {
    const c = client(); c.activate();
    const changes = { account: "state.accountId='other'", revision: 'state.tokenRevision++', token: "state.token='other'",
      controller: 'navigator.serviceWorker.controller={}', 'source-url': "location.href+='other'",
      abort: 'state.accountStateAbortController.abort()', deadline: 'Date.now=()=>Number.MAX_SAFE_INTEGER' };
    c.run(changes[fault]);
    await assert.rejects(c.run('moveDriveFile(item,target)'));
    assert.equal(c.patches().length, 0);
  });
}

// The fixture can access VM lexical names to probe forgery/replay at the exact
// controller-to-transport boundary, without changing any production function.
function issueForTransport(c) {
  c.run(`const owner=captureDriveMutationOwner();const scope=disposableDriveMutations.select(owner,item,'trash',null);
    const before=driveMutationMetadata(${JSON.stringify(c.files.get('image-one'))},'image-one');
    const entry={state:'submitted',fileId:item.id,action:'trash',before};
    const address=DRIVE_API+'/files/image-one?'+new URLSearchParams({supportsAllDrives:'true',fields:DRIVE_MUTATION_FIELDS});
    const request={method:'PATCH',body:'{"trashed":true}',driveNoRetry:true,...owner.options};
    const permit=disposableDriveMutations.issue(scope,owner,entry,null,address,request);
    request[DISPOSABLE_DRIVE_MUTATION]=permit;`);
}

for (const fault of ['body', 'url', 'DELETE', 'upload', 'appData', 'sharing', 'target', 'headers', 'forged', 'deadline', 'abort', 'revision']) {
  test(`transport consumes and rejects ${fault} permit mismatch without sending`, async () => {
    const c = client(); c.activate(); issueForTransport(c);
    const changes = { body: "request.body='{}'", url: "requestAddress=address+'&extra=true'", DELETE: "request.method='DELETE'",
      upload: "requestAddress='https://www.googleapis.com/upload/drive/v3/files/image-one'",
      appData: 'request[ACCOUNT_STATE_WRITE]={}', sharing: "requestAddress=DRIVE_API+'/files/image-one/permissions'",
      target: "requestAddress=address+'&addParents=original-folder'", forged: 'request[DISPOSABLE_DRIVE_MUTATION]={}',
      headers: "request.headers={'X-HTTP-Method-Override':'DELETE'}",
      deadline: 'Date.now=()=>Number.MAX_SAFE_INTEGER', abort: 'request.signal.dispatchEvent(new Event("abort"))', revision: 'state.tokenRevision++' };
    c.Event = Event;
    c.run('let requestAddress=address;'); c.run(changes[fault]);
    await assert.rejects(c.run('driveFetch(requestAddress,request)'));
    assert.equal(c.patches().length, 0);
    await assert.rejects(c.run('driveFetch(address,request)'));
    assert.equal(c.patches().length, 0);
  });
}

test('successful one-use transport permit cannot replay', async () => {
  const c = client(); c.activate(); issueForTransport(c);
  await c.run('driveFetch(address,request)');
  await assert.rejects(c.run('driveFetch(address,request)'));
  assert.equal(c.patches().length, 1);
  assert.equal(c.patches()[0].options.redirect, 'error');
  assert.equal(c.patches()[0].options.credentials, 'omit');
});

for (const fault of ['revision', 'account', 'abort', 'expiry']) {
  test(`ownership changes during fresh folder reads (${fault}) never reach submit`, async () => {
    const c = client(); c.activate();
    c.hook = ({ id }) => {
      if (id !== 'files') return;
      if (fault === 'revision') c.run('state.tokenRevision++');
      if (fault === 'account') c.run("state.accountId='other'");
      if (fault === 'abort') c.run('state.accountStateAbortController.abort()');
      if (fault === 'expiry') c.run('Date.now=()=>Number.MAX_SAFE_INTEGER');
    };
    await assert.rejects(c.run('moveDriveFile(item,target)'));
    assert.equal(c.patches().length, 0);
  });
}

test('expired disposable permit never asks for a credential refresh', async () => {
  const c = client(); c.activate(); issueForTransport(c);
  c.run('let refreshCalls=0;requestDriveCredential=async()=>{refreshCalls++;};state.expiresAt=0;');
  await assert.rejects(c.run('driveFetch(address,request)'));
  assert.equal(c.run('refreshCalls'), 0);
  assert.equal(c.patches().length, 0);
});

test('closing the lease revokes an issued pending permit', async () => {
  const c = client(); c.activate(); issueForTransport(c);
  c.run('lease.close()');
  await assert.rejects(c.run('driveFetch(address,request)'));
  assert.equal(c.patches().length, 0);
});

test('five-second dispatch expiry denies a permit while its two-minute lease is still current', async () => {
  const c = client(); c.activate(); issueForTransport(c);
  c.run('const dispatchClock=Date.now();Date.now=()=>dispatchClock+6000;');
  await assert.rejects(c.run('driveFetch(address,request)'));
  assert.equal(c.patches().length, 0);
  // A newly requested canonical operation still uses the unexpired lease.
  await c.run('trashDriveFile(item)');
  assert.equal(c.patches().length, 1);
});

test('lost-before-submit journal remains recoverable by GET after lease deadline', async () => {
  const c = client(); c.activate(); const fetch = c.fetch;
  c.fetch = async (url, options) => {
    if (options?.method === 'PATCH') throw new TypeError('synthetic lost before apply');
    return fetch(url, options);
  };
  await assert.rejects(c.run('trashDriveFile(item)'), error => error.mutationState === 'uncertain');
  c.run('Date.now=()=>Number.MAX_SAFE_INTEGER;lease.close();state.expiresAt=Number.MAX_VALUE;');
  const count = c.calls.length;
  await c.run('recoverDriveMutations()');
  assert.ok(c.calls.length > count);
  assert.ok(c.calls.slice(count).every(call => call.method === 'GET'));
});

for (const event of ['pagehide', 'beforeunload']) {
  test(`${event} revokes issued permits and does not revive on a same-document BFCache return`, async () => {
    const c = client(), baseline = [c.lifecycleListeners('pagehide'), c.lifecycleListeners('beforeunload')];
    c.activate(); issueForTransport(c);
    assert.equal(c.lifecycleListeners(event), baseline[event === 'pagehide' ? 0 : 1] + 1);
    c.lifecycle(event);
    assert.deepEqual([c.lifecycleListeners('pagehide'), c.lifecycleListeners('beforeunload')], baseline);
    await assert.rejects(c.run('driveFetch(address,request)'));
    c.lifecycle('pageshow');
    await assert.rejects(c.run('moveDriveFile(item,target)'));
    assert.equal(c.patches().length, 0);
  });
}

for (const exit of ['close', 'abort', 'expiry', 'failed-activation', 'replacement']) {
  test(`lease lifecycle listeners have one owner and are removed on ${exit}`, async () => {
    const c = client(), baseline = [c.lifecycleListeners('pagehide'), c.lifecycleListeners('beforeunload')];
    c.activate();
    assert.deepEqual([c.lifecycleListeners('pagehide'), c.lifecycleListeners('beforeunload')], baseline.map(n => n + 1));
    if (exit === 'close') c.run('lease.close();lease.close();');
    if (exit === 'abort') c.run('state.accountStateAbortController.abort()');
    if (exit === 'expiry') {
      c.run('Date.now=()=>Number.MAX_SAFE_INTEGER');
      await assert.rejects(c.run('moveDriveFile(item,target)'));
    }
    if (exit === 'failed-activation') {
      c.storage.set(ledgerKey, '{}'); assert.throws(c.activate);
    }
    if (exit === 'replacement') {
      c.run('const oldLease=lease;'); c.activate();
      assert.deepEqual([c.lifecycleListeners('pagehide'), c.lifecycleListeners('beforeunload')], baseline.map(n => n + 1));
      c.run('oldLease.close()');
      assert.deepEqual([c.lifecycleListeners('pagehide'), c.lifecycleListeners('beforeunload')], baseline.map(n => n + 1));
      c.run('lease.close()');
    }
    assert.deepEqual([c.lifecycleListeners('pagehide'), c.lifecycleListeners('beforeunload')], baseline);
    assert.equal(c.patches().length, 0);
  });
}
