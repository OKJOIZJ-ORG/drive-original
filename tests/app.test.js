'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadAppContext(initialStorage = {}, runtimeConfig = { driveMutationsEnabled: true }) {
  const storage = new Map(Object.entries(initialStorage));
  const context = {
    AbortController,
    Blob,
    DOMException,
    Headers,
    Map,
    Math,
    Promise,
    Response,
    Set,
    URL,
    URLSearchParams,
    __DRIVE_ORIGINAL_RUNTIME__: runtimeConfig,
    clearInterval,
    clearTimeout,
    console,
    fetch,
    history: { replaceState() {} },
    location: {
      hash: '',
      href: 'https://example.test/drive-original/',
      origin: 'https://example.test',
      pathname: '/drive-original/',
      protocol: 'https:',
      search: ''
    },
    localStorage: {
      getItem(key) { return storage.get(key) ?? null; },
      removeItem(key) { storage.delete(key); },
      setItem(key, value) { storage.set(key, String(value)); }
    },
    navigator: { onLine: true },
    performance,
    requestAnimationFrame(callback) { return setTimeout(callback, 0); },
    setInterval,
    setTimeout
  };
  context.window = {
    addEventListener() {},
    isSecureContext: true,
    location: context.location,
    matchMedia() { return { matches: false }; },
    removeEventListener() {},
    setTimeout
  };
  context.document = {
    addEventListener() {},
    querySelectorAll() { return []; }
  };
  context.matchMedia = context.window.matchMedia;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../media/revision-pin.js'), 'utf8'), context);
  const appPath = path.join(__dirname, '..', 'app.js');
  vm.runInContext(fs.readFileSync(appPath, 'utf8'), context, { filename: appPath });
  // Existing fixtures represent a verified full-grant credential. Partial/unknown tests override this explicitly.
  vm.runInContext('state.authCapabilities = { version: 1, driveRead: true, driveWrite: true, appData: true };', context);
  return context;
}

test('normal update preserves the active multi-client worker and complete shell while replacing only this document', async () => {
  const context = loadAppContext({ 'preserved-state': 'unchanged' }), deleted = [], unregistered = [], navigations = [];
  context.caches = context.window.caches = {
    keys: async () => ['drive-original-shell-current', 'sibling-shell'],
    delete: async key => deleted.push(key)
  };
  context.navigator.serviceWorker = { getRegistrations: async () => [
    { scope: 'https://example.test/drive-original/', unregister: async () => unregistered.push('ours') },
    { scope: 'https://example.test/other/', unregister: async () => unregistered.push('sibling') }
  ] };
  context.location.href = 'https://example.test/drive-original/?preserved=1#selection';
  context.location.replace = value => navigations.push(value);
  context.requestSessionCredential = () => { throw new Error('update must not request a credential'); };
  run(context, `showToast=()=>{};state.accountId='account';state.authAccountKey='auth';state.driveSessionGeneration=7;
    q0PinnedSource=Object.freeze({descriptor:Object.freeze({headRevisionId:'pinned'})});
    globalThis.savedPin=q0PinnedSource;q1RetirementResult={settled:false};`);
  await run(context, 'applyAppUpdate()');
  assert.deepEqual(deleted, [], 'the existing complete shell must survive the normal update');
  assert.deepEqual(unregistered, [], 'other controlled clients must retain the same registered worker');
  assert.equal(navigations.length, 1);
  const target = new URL(navigations[0]);
  assert.equal(target.origin, 'https://example.test');assert.equal(target.pathname, '/drive-original/');
  assert.equal(target.searchParams.get('preserved'), '1');assert.match(target.searchParams.get('_update'), /^\d+$/);
  assert.equal(target.hash, '#selection');
  assert.equal(run(context, 'updatePending'), true);
  assert.equal(run(context, 'q0PinnedSource===savedPin'), true);
  assert.equal(run(context, 'q1RetirementResult.settled'), false, 'reload does not waive this document retirement barrier');
  assert.equal(run(context, 'state.authAccountKey'), 'auth');assert.equal(run(context, 'state.driveSessionGeneration'), 7);
  assert.equal(context.localStorage.getItem('preserved-state'), 'unchanged');
});

function shellRefreshFixture({ controlled = true, reply = 'success' } = {}) {
  const context = loadAppContext({ 'preserved-state': 'unchanged' }), deleted = [], unregistered = [], reloads = [], channels = [], requests = [];
  context.caches = context.window.caches = { keys: async () => ['drive-original-shell-current', 'sibling-shell'], delete: async key => deleted.push(key) };
  context.MessageChannel = class {
    constructor() { this.port1 = { close() { this.closed = true; } }; this.port2 = { close() { this.closed = true; } }; this.port2.peer = this.port1; channels.push(this); }
  };
  const worker = { state: 'activated', scriptURL: 'https://example.test/drive-original/sw.js', postMessage(data, ports) {
    requests.push(data); if (reply === 'hold') return;
    queueMicrotask(() => ports[0].peer.onmessage?.({ data: { type: 'APP_SHELL_REFRESH_RESULT', protocol: data.protocol,
      requestId: reply === 'wrong-id' ? 'wrong' : data.requestId, ok: reply !== 'failure', version: run(context, 'APP_VERSION') } }));
  } };
  const registration = { scope: 'https://example.test/drive-original/', active: worker, unregister: async () => unregistered.push('ours') };
  context.navigator.serviceWorker = { controller: controlled ? worker : null, getRegistration: async () => registration,
    getRegistrations: async () => { throw Error('must not enumerate/unregister siblings'); } };
  context.window.location.reload = () => reloads.push('reload');
  run(context, 'showToast=()=>{};reportAppFailure=()=>{};q1RetirementResult={settled:false};');
  return { context, deleted, unregistered, reloads, channels, requests, worker, registration };
}

test('force shell refresh requires matching worker ACK and preserves caches, registration, user state and retirement barrier', async () => {
  const f = shellRefreshFixture(); assert.equal(await run(f.context, 'forceReloadApp()'), true);
  assert.deepEqual(f.deleted, []);assert.deepEqual(f.unregistered, []);assert.deepEqual(f.reloads, ['reload']);
  assert.equal(f.requests.length, 1);assert.equal(f.requests[0].type, 'APP_SHELL_REFRESH');
  assert.equal(f.context.localStorage.getItem('preserved-state'), 'unchanged');
  assert.equal(run(f.context, 'q1RetirementResult.settled'), false);
  assert(f.channels.every(c => c.port1.closed && c.port2.closed && c.port1.onmessage === null));
});

test('force shell refresh can use an exact active registration in an uncontrolled document', async () => {
  const f = shellRefreshFixture({ controlled: false }); assert.equal(await run(f.context, 'forceReloadApp()'), true);
  assert.equal(f.requests.length, 1);assert.deepEqual(f.reloads, ['reload']);
});

test('force shell refresh coalesces repeated clicks and rejects stale account/source/seek/controller replies', async () => {
  for (const change of ["state.authAccountKey='different'", 'mediaSourceGeneration++', 'mediaSeekGeneration++', 'navigator.serviceWorker.controller=null']) {
    const f = shellRefreshFixture({ reply: 'hold' });const first = run(f.context, 'forceReloadApp()'), second = run(f.context, 'forceReloadApp()');
    assert.equal(first, second);await new Promise(resolve => setImmediate(resolve));assert.equal(f.requests.length, 1);
    run(f.context, change);const data=f.requests[0];f.channels[0].port1.onmessage({ data: { type:'APP_SHELL_REFRESH_RESULT', protocol:data.protocol,requestId:data.requestId,ok:true,version:run(f.context,'APP_VERSION') } });
    assert.equal(await first, false);assert.deepEqual(f.reloads, []);assert(f.channels[0].port1.closed);
  }
});

test('force shell refresh rejects negative or wrong ACK and unsupported workers without destructive reset', async () => {
  for (const reply of ['failure', 'wrong-id']) { const f=shellRefreshFixture({reply});assert.equal(await run(f.context,'forceReloadApp()'),false);
    assert.deepEqual(f.reloads,[]);assert.deepEqual(f.deleted,[]);assert.deepEqual(f.unregistered,[]); }
  const f=shellRefreshFixture();f.worker.scriptURL='https://example.test/other/sw.js';assert.equal(await run(f.context,'forceReloadApp()'),false);assert.equal(f.requests.length,0);
});

test('force shell refresh deadline closes ports and late ACK cannot reload', async () => {
  const f=shellRefreshFixture({reply:'hold'});let deadline;f.context.setTimeout=fn=>{deadline=fn;return 1;};f.context.clearTimeout=()=>{};
  const result=run(f.context,'forceReloadApp()');await new Promise(resolve=>setImmediate(resolve));const late=f.channels[0].port1.onmessage;
  deadline();assert.equal(await result,false);assert(f.channels[0].port1.closed);const data=f.requests[0];
  late({data:{type:'APP_SHELL_REFRESH_RESULT',protocol:data.protocol,requestId:data.requestId,ok:true,version:run(f.context,'APP_VERSION')}});
  await Promise.resolve();assert.deepEqual(f.reloads,[]);assert.deepEqual(f.deleted,[]);
});

test('candidate runtime blocks Drive mutations before fetch until the state gate opens', async () => {
  const context = loadAppContext({}, { candidate: true, driveMutationsEnabled: false });
  let calls = 0;
  context.fetch = async () => { calls++; return new Response('{}', { status: 200 }); };
  run(context, `state.token='fixture-token';state.expiresAt=Date.now()+3600000;`);
  for (const method of ['POST', 'PATCH', 'PUT', 'DELETE']) {
    await assert.rejects(
      run(context, `driveFetch('https://www.googleapis.com/drive/v3/files', {method:'${method}'})`),
      error => error?.code === 'candidate_read_only' && error?.status === 423
    );
  }
  assert.equal(calls, 0);
  for (const method of ['GET', 'HEAD']) {
    const response = await run(context, `driveFetch('https://www.googleapis.com/drive/v3/files', {method:'${method}'})`);
    assert.equal(response.status, 200);
  }
  assert.equal(calls, 2);

  const missingConfig = loadAppContext({}, null);
  missingConfig.fetch = async () => { throw new Error('must not reach the network'); };
  run(missingConfig, `state.token='fixture-token';state.expiresAt=Date.now()+3600000;`);
  await assert.rejects(
    run(missingConfig, `driveFetch('https://www.googleapis.com/upload/drive/v3/files', {method:'POST'})`),
    error => error?.code === 'candidate_read_only'
  );
});

test('candidate prerelease versions remain valid and compare in SemVer order', () => {
  const context = loadAppContext();
  assert.deepEqual(Array.from(run(context, `parseAppVersion('1.22.0-rc.1')`).core), [1, 22, 0]);
  assert.equal(run(context, `isNewerVersion('1.22.0-rc.2', '1.22.0-rc.1')`), true);
  assert.equal(run(context, `isNewerVersion('1.22.0-rc.1', '1.22.0-rc')`), true);
  assert.equal(run(context, `isNewerVersion('1.22.0', '1.22.0-rc.2')`), true);
  assert.equal(run(context, `isNewerVersion('1.22.0-rc.1', '1.22.0')`), false);
  assert.equal(run(context, `isNewerVersion('not-a-version', '1.22.0-rc.1')`), false);
});

test('update checks keep newest feedback and release manual loading across out-of-order success and errors', async () => {
  for (const scenario of [
    { oldManual: false, newest: 'update', older: 'current', newerFirst: true },
    { oldManual: true, newest: 'update', older: 'error', newerFirst: true },
    { oldManual: true, newest: 'error', older: 'current', newerFirst: false },
    { oldManual: true, newest: 'current', older: 'update', newerFirst: false }
  ]) {
    const context = loadAppContext();
    context.console = { error() {}, warn() {}, log() {} };
    const requests = [];
    context.fetch = () => new Promise((resolve, reject) => requests.push({ resolve, reject }));
    run(context, `
      for (const id of ['updateBanner','settingsUpdateDot','applyUpdateButton']) el[id]={hidden:true};
      el.updateStatusText={textContent:''};el.checkUpdateButton={disabled:false};
      globalThis.updateToasts=[];showToast=text=>updateToasts.push(text);
    `);
    const older = run(context, `checkForAppUpdate({manual:${scenario.oldManual}})`);
    const newest = run(context, `checkForAppUpdate({manual:${!scenario.oldManual}})`);
    const settle = (index, outcome) => outcome === 'error'
      ? requests[index].reject(new Error('synthetic offline'))
      : requests[index].resolve(new Response(JSON.stringify({ version: outcome === 'update' ? '99.0.0' : run(context, 'APP_VERSION') })));
    if (scenario.newerFirst) {
      settle(1, scenario.newest); await newest;
      const published = run(context, 'JSON.stringify([el.updateBanner,el.applyUpdateButton,el.updateStatusText,el.checkUpdateButton,updateToasts])');
      settle(0, scenario.older); await older;
      assert.equal(run(context, 'JSON.stringify([el.updateBanner,el.applyUpdateButton,el.updateStatusText,el.checkUpdateButton,updateToasts])'), published, 'stale completion cannot change latest feedback');
    } else {
      settle(0, scenario.older); await older;
      assert.equal(run(context, 'el.checkUpdateButton.disabled'), true, 'stale manual finally cannot unlock newest check');
      settle(1, scenario.newest); await newest;
    }
    assert.equal(run(context, 'el.checkUpdateButton.disabled'), false, 'newest automatic check releases inherited manual loading');
    assert.equal(run(context, 'el.applyUpdateButton.hidden'), scenario.newest !== 'update');
    assert.match(run(context, 'el.updateStatusText.textContent'), scenario.newest === 'error' ? /오류/ : scenario.newest === 'update' ? /99\.0\.0/ : /현재 최신/);
  }
});

test('update deadline releases current manual loading for hanging fetch, body, and worker without losing a valid update', async () => {
  for (const phase of ['fetch', 'body', 'worker']) {
    const context = loadAppContext();
    context.console = { error() {}, warn() {}, log() {} };
    let elapsed = 0, nextTimer = 0, signal, releaseLate;
    const timers = new Map();
    context.setTimeout = (callback, delay) => { const id = ++nextTimer; timers.set(id, { callback, due: elapsed + delay }); return id; };
    context.clearTimeout = id => timers.delete(id);
    const hanging = new Promise(resolve => { releaseLate = resolve; });
    context.fetch = async (_url, options) => {
      signal = options.signal;
      if (phase === 'fetch') return hanging;
      return { ok: true, json: () => phase === 'body' ? hanging : Promise.resolve({ version: '99.0.0' }) };
    };
    context.hangingWorker = () => hanging;
    run(context, `
      for (const id of ['updateBanner','settingsUpdateDot','applyUpdateButton']) el[id]={hidden:false};
      el.updateStatusText={textContent:'valid update'};el.checkUpdateButton={disabled:false};showToast=()=>{};
      navigator.serviceWorker={};state.serviceWorkerRegistration={update:hangingWorker};
    `);
    const pending = run(context, 'checkForAppUpdate({manual:true})');
    for (let tick = 0; tick < 8; tick++) await Promise.resolve();
    const deadline = run(context, 'UPDATE_CHECK_TIMEOUT_MS');
    assert.ok(deadline > 0);
    elapsed = deadline - 1;
    assert.ok([...timers.values()].every(timer => timer.due > elapsed));
    assert.equal(run(context, 'el.checkUpdateButton.disabled'), true, `${phase} stays pending before its deadline`);
    elapsed++;
    for (const timer of [...timers.values()]) if (timer.due <= elapsed) timer.callback();
    await pending;
    assert.equal(signal.aborted, true, `${phase} aborts its owned fetch/body`);
    assert.equal(timers.size, 0);
    assert.equal(run(context, 'el.checkUpdateButton.disabled'), false);
    assert.match(run(context, 'el.updateStatusText.textContent'), /오류/);
    assert.equal(run(context, 'el.applyUpdateButton.hidden'), false, 'timeout preserves previously valid update');
    const timedOutUI = run(context, 'JSON.stringify([el.updateStatusText,el.applyUpdateButton,el.checkUpdateButton])');
    releaseLate(phase === 'fetch' ? { ok: true, json: async () => ({ version: '99.0.0' }) } : { version: '99.0.0' });
    for (let tick = 0; tick < 8; tick++) await Promise.resolve();
    assert.equal(run(context, 'JSON.stringify([el.updateStatusText,el.applyUpdateButton,el.checkUpdateButton])'), timedOutUI, 'late completion cannot publish after timeout');
  }
});

test('a stale update deadline cannot clear the newer automatic check manual loading', async () => {
  const context = loadAppContext();
  context.console = { error() {}, warn() {}, log() {} };
  const timers = new Map(); let nextTimer = 0;
  context.setTimeout = (callback, delay) => { const id = ++nextTimer; timers.set(id, { callback, delay }); return id; };
  context.clearTimeout = id => timers.delete(id);
  context.fetch = () => new Promise(() => {});
  run(context, `el.updateStatusText={textContent:''};el.checkUpdateButton={disabled:false};showToast=()=>{};`);
  const older = run(context, 'checkForAppUpdate({manual:true})');
  const newer = run(context, 'checkForAppUpdate({manual:false})');
  assert.ok(timers.get(1).delay > 0);
  timers.get(1).callback(); await older;
  assert.equal(run(context, 'el.checkUpdateButton.disabled'), true);
  assert.equal(run(context, 'el.updateStatusText.textContent'), '최신 버전 확인 중…');
  timers.get(2).callback(); await newer;
  assert.equal(run(context, 'el.checkUpdateButton.disabled'), false);
  assert.match(run(context, 'el.updateStatusText.textContent'), /오류/);
  assert.equal(timers.size, 0);
});

test('real listing failure logs fixed status classification without upstream private identifiers or credentials', async () => {
  const context = loadAppContext(), logs = [];
  context.console = { error: (...args) => logs.push(args), warn: (...args) => logs.push(args), log() {} };
  const canary = 'QA_PRIVATE_CANARY';
  context.fetch = async () => new Response(JSON.stringify({ error: {
    message: `File not found: ${canary}; https://private.invalid/${canary}; Bearer ${canary}`,
    errors: [{ reason: 'notFound' }]
  } }), { status: 404 });
  run(context, `
    state.token='synthetic-test-token';state.expiresAt=Date.now()+3600000;
    el.refreshButton={disabled:false};el.libraryStatus={textContent:''};
    showLibrary=()=>{};updateLibrarySummary=()=>{};updateConnectionBadge=()=>{};
  `);
  assert.equal(await run(context, 'loadFiles({append:false})'), false);
  assert.deepEqual(JSON.parse(JSON.stringify(logs)), [['[drive-original] library-list', { category: 'missing', status: 404 }]]);
  assert.doesNotMatch(JSON.stringify(logs), /QA_PRIVATE_CANARY|private\.invalid|Bearer/);
  assert.doesNotMatch(run(context, 'el.libraryStatus.textContent'), /QA_PRIVATE_CANARY/);
});

test('app failure records preserve auth/network/fixed codes but discard raw message stack and attached payload', () => {
  const context = loadAppContext(), logs = [];
  context.console = { error: (...args) => logs.push(args), warn: (...args) => logs.push(args) };
  run(context, `
    reportAppFailure('update-check', Object.assign(new TypeError('QA_SECRET_CANARY'), {stack:'QA_STACK_CANARY',url:'QA_URL_CANARY',token:'QA_TOKEN_CANARY'}));
    reportAppFailure('account-state-sync', {status:401,code:'auth_unavailable',message:'QA_REFRESH_CANARY',body:{privateId:'QA_ID_CANARY'}}, 'warn');
    reportAppFailure('library-list', {status:403,code:'QA_CODE_CANARY',name:'QA_NAME_CANARY',message:'QA_COOKIE_CANARY'});
  `);
  assert.equal(JSON.stringify(logs), JSON.stringify([
    ['[drive-original] update-check', {category:'network-or-type'}],
    ['[drive-original] account-state-sync', {category:'authentication',status:401,code:'auth_unavailable'}],
    ['[drive-original] library-list', {category:'permission',status:403}]
  ]));
  assert.doesNotMatch(JSON.stringify(logs), /CANARY/);
});

test('a new service worker reconnects only a pre-byte Range source without consuming its retry', () => {
  const context = loadAppContext();
  run(context, `(() => {
    globalThis.controllerReconnects = [];
    state.selected = { id: 'upgrade-skew-video', mimeType: 'video/mp4' };
    state.mediaSession = 23;
    state.mediaAttempt = 'range';
    state.mediaTransportStarted = false;
    el.videoPlayer = { hidden: false, dataset: { mediaSession: '23' } };
    retryOriginalStream = (file, session, message, options) => {
      controllerReconnects.push({ fileId: file.id, session, message, options });
      return true;
    };
  })()`);

  assert.equal(run(context, 'restartPendingMediaAfterServiceWorkerChange()'), true);
  assert.deepEqual(JSON.parse(run(context, 'JSON.stringify(controllerReconnects)')), [{
    fileId: 'upgrade-skew-video',
    session: 23,
    message: '새 원본 스트림에 다시 연결하는 중',
    options: { consumeRetry: false }
  }]);

  run(context, 'state.mediaTransportStarted = true');
  assert.equal(run(context, 'restartPendingMediaAfterServiceWorkerChange()'), false);
  run(context, `state.mediaTransportStarted = false; state.mediaAttempt = 'blob'`);
  assert.equal(run(context, 'restartPendingMediaAfterServiceWorkerChange()'), false);
  run(context, `state.mediaAttempt = 'range'; el.videoPlayer.dataset.mediaSession = '22'`);
  assert.equal(run(context, 'restartPendingMediaAfterServiceWorkerChange()'), false);
  assert.equal(run(context, 'controllerReconnects.length'), 1);
});

test('callback auth error is consumed once, preserves unrelated URL state, and ignores unknown input safely', () => {
  const context = loadAppContext();
  const replacements = [];
  context.document.title = 'Drive Original';
  context.history.state = { owner: 'fixture' };
  context.history.replaceState = (stateValue, title, next) => {
    replacements.push({ stateValue, title, next });
    const nextUrl = new URL(next, context.location.origin);
    context.location.href = nextUrl.href;
    context.location.pathname = nextUrl.pathname;
    context.location.search = nextUrl.search;
    context.location.hash = nextUrl.hash;
  };
  const setLocation = (value) => {
    const url = new URL(value);
    context.location.href = url.href;
    context.location.pathname = url.pathname;
    context.location.search = url.search;
    context.location.hash = url.hash;
  };

  setLocation('https://example.test/drive-original/?keep=1&authError=transaction_invalid#folder');
  assert.equal(run(context, 'consumeAuthCallbackError()'), 'Google 로그인 요청이 만료되었거나 확인되지 않았습니다. 다시 연결해 주세요.');
  assert.equal(replacements[0].next, '/drive-original/?keep=1#folder');
  assert.equal(replacements[0].stateValue.owner, 'fixture');
  assert.equal(run(context, 'consumeAuthCallbackError()'), null);
  assert.equal(replacements.length, 1);

  run(context, `el.authHint={textContent:'unchanged',classList:{add(){this.added=true},remove(){}}};state.token=null;state.expiresAt=0;`);
  assert.equal(run(context, `showAuthCallbackError('Google 로그인 요청이 만료되었거나 확인되지 않았습니다. 다시 연결해 주세요.')`), true);
  assert.equal(run(context, 'el.authHint.textContent'), 'Google 로그인 요청이 만료되었거나 확인되지 않았습니다. 다시 연결해 주세요.');
  run(context, `el.authHint.textContent='authenticated';state.token='usable';state.expiresAt=Date.now()+60000;`);
  assert.equal(run(context, `showAuthCallbackError('표시되면 안 됨')`), false);
  assert.equal(run(context, 'el.authHint.textContent'), 'authenticated');

  setLocation('https://example.test/drive-original/?authError=unknown&keep=2#safe');
  assert.equal(run(context, 'consumeAuthCallbackError()'), null);
  assert.equal(replacements.at(-1).next, '/drive-original/?keep=2#safe');
  for (const inheritedName of ['toString', '__proto__']) {
    setLocation(`https://example.test/drive-original/?authError=${inheritedName}&keep=own-only`);
    assert.equal(run(context, 'consumeAuthCallbackError()'), null);
    assert.equal(replacements.at(-1).next, '/drive-original/?keep=own-only');
  }
  setLocation('https://example.test/drive-original/?authError=transaction_invalid&authError=auth_unavailable&keep=3');
  assert.equal(run(context, 'consumeAuthCallbackError()'), null);
  assert.equal(replacements.at(-1).next, '/drive-original/?keep=3');
});

test('SVG icon visibility follows playback, volume and fullscreen attributes', () => {
  const context = loadAppContext();
  run(context, `
    const svgIcon = hidden => {
      const attributes = new Set(hidden ? ['hidden'] : []);
      return {
        toggleAttribute(name, force) { if (force) attributes.add(name); else attributes.delete(name); },
        hasAttribute(name) { return attributes.has(name); }
      };
    };
    for (const name of ['ctrlIconPlay', 'iconCenterPlay', 'ctrlIconVolHigh', 'iconExpand', 'ctrlIconExpand']) el[name] = svgIcon(false);
    for (const name of ['ctrlIconPause', 'iconCenterPause', 'ctrlIconVolMuted', 'iconCompress', 'ctrlIconCompress']) el[name] = svgIcon(true);
    el.videoPlayer = { hidden: false, paused: false, muted: false, volume: 1 };
    updatePlayPauseUI(); updateVolumeUI(); updateFullscreenUI();
  `);
  const assertHidden = (name, expected) => assert.equal(run(context, `el.${name}.hasAttribute('hidden')`), expected, name);
  for (const name of ['ctrlIconPlay', 'iconCenterPlay', 'ctrlIconVolMuted', 'iconCompress', 'ctrlIconCompress']) assertHidden(name, true);
  for (const name of ['ctrlIconPause', 'iconCenterPause', 'ctrlIconVolHigh', 'iconExpand', 'ctrlIconExpand']) assertHidden(name, false);
  run(context, 'el.videoPlayer.paused = true; el.videoPlayer.muted = true; document.fullscreenElement = {}; updatePlayPauseUI(); updateVolumeUI(); updateFullscreenUI();');
  for (const name of ['ctrlIconPlay', 'iconCenterPlay', 'ctrlIconVolMuted', 'iconCompress', 'ctrlIconCompress']) assertHidden(name, false);
  for (const name of ['ctrlIconPause', 'iconCenterPause', 'ctrlIconVolHigh', 'iconExpand', 'ctrlIconExpand']) assertHidden(name, true);
  run(context, 'el.videoPlayer.muted = false; el.videoPlayer.volume = 0; document.fullscreenElement = null; document.webkitFullscreenElement = {}; updateVolumeUI(); updateFullscreenUI();');
  assertHidden('ctrlIconVolHigh', true);
  assertHidden('ctrlIconVolMuted', false);
  assertHidden('iconExpand', true);
  assertHidden('ctrlIconExpand', true);
  run(context, 'el.videoPlayer.volume = 1; document.webkitFullscreenElement = null; updateVolumeUI(); updateFullscreenUI();');
  assertHidden('ctrlIconVolHigh', false);
  assertHidden('ctrlIconVolMuted', true);
  assertHidden('iconExpand', false);
  assertHidden('ctrlIconExpand', false);
});

function run(context, source) {
  return vm.runInContext(source, context);
}

function installAuthUi(context) {
  run(context, `(() => {
    const buttonLabel = { textContent: '' };
    const badgeLabel = { textContent: '' };
    globalThis.authUi = { buttonLabel, badgeLabel };
    el.connectButton = { disabled: false, querySelector() { return buttonLabel; } };
    el.connectionBadge = { dataset: {}, querySelector() { return badgeLabel; } };
    el.authHint = { textContent: '', classList: { add() {}, remove() {} } };
    el.setupView = { hidden: false, setAttribute() {} };
    el.libraryView = { hidden: true };
    document.getElementById = () => null;
  })()`);
}

function installFakeClock(context, startAt = 1_000) {
  let now = startAt;
  let sequence = 0;
  const scheduled = new Map();
  const captured = [];
  const setTimeoutImpl = (callback, delay = 0) => {
    const id = ++sequence;
    const entry = { id, callback, delay: Math.max(0, Number(delay) || 0), due: now + Math.max(0, Number(delay) || 0) };
    scheduled.set(id, entry);
    captured.push(entry);
    return id;
  };
  const clearTimeoutImpl = (id) => scheduled.delete(id);
  context.setTimeout = setTimeoutImpl;
  context.clearTimeout = clearTimeoutImpl;
  context.window.setTimeout = setTimeoutImpl;
  context.window.clearTimeout = clearTimeoutImpl;
  context.__mediaWatchdogClock = { now };
  run(context, 'mediaDiagnosticTimestamp = () => __mediaWatchdogClock.now');

  const advance = (milliseconds) => {
    now += milliseconds;
    context.__mediaWatchdogClock.now = now;
    while (true) {
      const due = [...scheduled.values()]
        .filter((entry) => entry.due <= now)
        .sort((left, right) => left.due - right.due || left.id - right.id)[0];
      if (!due) break;
      scheduled.delete(due.id);
      due.callback();
    }
  };

  return { advance, captured, scheduled, now: () => now };
}

function installMiniDom(context) {
  class MiniNode {
    constructor(tagName) {
      this.tagName = tagName;
      this.children = [];
      this.className = '';
      this.dataset = {};
      this.style = { setProperty() {} };
      this.classList = {
        add: (...names) => {
          const set = new Set(this.className.split(/\s+/).filter(Boolean));
          names.forEach((name) => set.add(name));
          this.className = [...set].join(' ');
        },
        remove: (...names) => {
          const set = new Set(this.className.split(/\s+/).filter(Boolean));
          names.forEach((name) => set.delete(name));
          this.className = [...set].join(' ');
        },
        toggle: (name, force) => {
          const set = new Set(this.className.split(/\s+/).filter(Boolean));
          const enabled = force === undefined ? !set.has(name) : Boolean(force);
          if (enabled) set.add(name);
          else set.delete(name);
          this.className = [...set].join(' ');
          return enabled;
        },
        contains: (name) => this.className.split(/\s+/).filter(Boolean).includes(name)
      };
      this.offsetHeight = tagName === 'button' ? 240 : 0;
    }

    addEventListener() {}
    setAttribute() {}
    remove() { this.removed = true; }
    append(...nodes) { nodes.forEach((node) => this.appendChild(node)); }
    appendChild(node) {
      if (node?.tagName === '#fragment') this.children.push(...node.children);
      else if (node) this.children.push(node);
      return node;
    }
    replaceChildren(...nodes) {
      this.children = [];
      nodes.forEach((node) => this.appendChild(node));
    }
    querySelector(selector) {
      return findNodes(this, selector)[0] || null;
    }
  }

  function findNodes(root, selector) {
    const className = selector.startsWith('.') ? selector.slice(1) : null;
    const tagName = className ? null : selector.toLowerCase();
    const found = [];
    const visit = (node) => {
      if (!node || node.removed) return;
      const classes = String(node.className || '').split(/\s+/);
      if ((className && classes.includes(className)) || (tagName && String(node.tagName).toLowerCase() === tagName)) {
        found.push(node);
      }
      (node.children || []).forEach(visit);
    };
    visit(root);
    return found;
  }

  context.document.createElement = (tagName) => new MiniNode(String(tagName).toLowerCase());
  context.document.createDocumentFragment = () => new MiniNode('#fragment');
  return { findNodes };
}

test('GIF detection covers MIME and case-insensitive filename fallback', () => {
  const context = loadAppContext();
  assert.equal(run(context, "isGifFile({ mimeType: 'image/gif', name: 'still.bin' })"), true);
  assert.equal(run(context, "isGifFile({ mimeType: 'application/octet-stream', name: 'CLIP.GIF' })"), true);
  assert.equal(run(context, "isGifFile({ mimeType: 'image/jpeg', name: 'photo.jpg' })"), false);
});

test('session credentials are strict, memory-only, and remove legacy browser artifacts', () => {
  const context = loadAppContext({
    'drive-original.oauth-token': 'legacy-token',
    'drive-original.oauth-client-id': 'legacy-client'
  });
  const writes = [];
  const setItem = context.localStorage.setItem;
  context.localStorage.setItem = (key, value) => { writes.push([key, String(value)]); setItem.call(context.localStorage, key, value); };
  const result = JSON.parse(run(context, `(() => {
    scheduleTokenRenewal = () => {};
    clearAuthError = () => {};
    sendTokenToWorker = () => {};
    updateConnectionBadge = () => {};
    resumeAfterCredential = () => {};
    removeLegacyCredentialStorage();
    const expiresAt = Date.now() + 60_000;
    const installed = installSessionCredential({ capabilities: { version: 1, driveRead: true, driveWrite: true, appData: true }, accessToken: 'session-token', expiresAt, account: 'account-A', revision: 7, sessionMarker: 's'.repeat(43) }, { generation: state.authGeneration });
    const rejected = [
      installSessionCredential({ capabilities: { version: 1, driveRead: true, driveWrite: true, appData: true }, accessToken: '', expiresAt, account: 'account-A', revision: 8 }, { generation: state.authGeneration }),
      installSessionCredential({ capabilities: { version: 1, driveRead: true, driveWrite: true, appData: true }, accessToken: 'near-expiry', expiresAt: Date.now() + TOKEN_SKEW_MS, account: 'account-A', revision: 8 }, { generation: state.authGeneration }),
      installSessionCredential({ capabilities: { version: 1, driveRead: true, driveWrite: true, appData: true }, accessToken: 'bad-account', expiresAt, account: 'bad account', revision: 8 }, { generation: state.authGeneration }),
      installSessionCredential({ capabilities: { version: 1, driveRead: true, driveWrite: true, appData: true }, accessToken: 'string-numbers', expiresAt: String(expiresAt), account: 'account-A', revision: '8' }, { generation: state.authGeneration }),
      installSessionCredential({ capabilities: { version: 1, driveRead: true, driveWrite: true, appData: true }, accessToken: 'bad-marker', expiresAt, account: 'account-A', revision: 8, sessionMarker: 'not valid' }, { generation: state.authGeneration })
    ];
    return JSON.stringify({ installed, rejected, token: state.token, expiresAt: state.expiresAt, account: state.authAccountKey, revision: state.tokenRevision,
      sessionMarker: sessionCredentialMarker,
      legacyToken: localStorage.getItem(LEGACY_TOKEN_STORAGE_KEY), legacyClient: localStorage.getItem(LEGACY_CLIENT_ID_STORAGE_KEY),
      hasClientId: Object.hasOwn(state, 'clientId') });
  })()`));
  assert.deepEqual(result, {
    installed: true,
    rejected: [false, false, false, false, false],
    token: 'session-token',
    expiresAt: result.expiresAt,
    account: 'account-A',
    revision: 7,
    sessionMarker: 's'.repeat(43),
    legacyToken: null,
    legacyClient: null,
    hasClientId: false
  });
  assert.ok(result.expiresAt > Date.now());
  assert.deepEqual(writes, [], 'installing a server credential must not persist an access token or client override');
});

test('same-origin credential requests are single-flight and send the account fence', async () => {
  const context = loadAppContext();
  let calls = 0; let request; let release;
  context.fetch = async (url, options) => {
    calls += 1;
    request = { url: String(url), options };
    await new Promise((resolve) => { release = resolve; });
    return new Response(JSON.stringify({
      capabilities: { version: 1, driveRead: true, driveWrite: true, appData: true }, accessToken: 'renewed-token', expiresAt: Date.now() + 60_000, account: 'account-A', revision: 4,
      sessionMarker: 'm'.repeat(43)
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  };
  run(context, `state.authAccountKey='account-A';state.token='expired';state.expiresAt=0;state.tokenRevision=3;
    el.connectionBadge={dataset:{},querySelector(){return null}};el.authHint={textContent:'',classList:{add(){},remove(){}}};
    scheduleTokenRenewal=()=>{};resumeAfterCredential=()=>{};sendTokenToWorker=()=>{};`);
  const first = run(context, 'requestSessionCredential({background:true,force:true})');
  const second = run(context, 'requestSessionCredential({background:true,force:true})');
  assert.equal(calls, 1);
  release();
  assert.deepEqual(await Promise.all([first, second]), [true, true]);
  assert.equal(calls, 1);
  assert.equal(request.url, 'https://example.test/api/session/credential');
  assert.deepEqual(JSON.parse(request.options.body), { expectedAccount: 'account-A', rejectedRevision: null, credentialProtocol: 2 });
  assert.equal(request.options.credentials, 'same-origin');
  assert.equal(request.options.cache, 'no-store');
  assert.equal(request.options.mode, 'same-origin');
  assert.equal(request.options.redirect, 'error');
  assert.equal(request.options.headers['X-Drive-Original-CSRF'], '1');
  assert.equal(run(context, 'state.tokenRevision'), 4);
  assert.equal(run(context, 'sessionCredentialMarker'), 'm'.repeat(43));
});

test('initial session recovery keeps the reconnect action inert until the credential probe settles', () => {
  const context = loadAppContext();
  const result = JSON.parse(run(context, `(() => {
    const buttonLabel = { textContent: '' };
    const badgeLabel = { textContent: '' };
    const attributes = {};
    el.connectButton = { disabled: false, querySelector() { return buttonLabel; } };
    el.connectionBadge = { dataset: {}, querySelector() { return badgeLabel; } };
    el.setupView = { setAttribute(name, value) { attributes[name] = value; } };
    document.getElementById = () => null;
    setBootstrapAuthPending(true);
    const pending = {
      disabled: el.connectButton.disabled,
      buttonLabel: buttonLabel.textContent,
      badgeState: el.connectionBadge.dataset.state,
      badgeLabel: badgeLabel.textContent,
      ariaBusy: attributes['aria-busy']
    };
    setBootstrapAuthPending(false);
    return JSON.stringify({ pending, settled: {
      disabled: el.connectButton.disabled,
      buttonLabel: buttonLabel.textContent,
      badgeState: el.connectionBadge.dataset.state,
      badgeLabel: badgeLabel.textContent,
      ariaBusy: attributes['aria-busy']
    } });
  })()`));
  assert.deepEqual(result.pending, {
    disabled: true,
    buttonLabel: '기존 Drive 연결 확인 중…',
    badgeState: 'busy',
    badgeLabel: '연결 중…',
    ariaBusy: 'true'
  });
  assert.deepEqual(result.settled, {
    disabled: false,
    buttonLabel: 'Google Drive에 연결',
    badgeState: 'offline',
    badgeLabel: '연결 안 됨',
    ariaBusy: 'false'
  });
});

test('iOS standalone starts OAuth inside the web-app context while browser surfaces keep same-window navigation', () => {
  const standalone = loadAppContext();
  installAuthUi(standalone);
  const opened = [];
  const assigned = [];
  const authWindow = { opener: standalone.window };
  standalone.window.open = (url, target) => {
    opened.push({ url: String(url), target });
    return authWindow;
  };
  standalone.location.assign = (url) => assigned.push(String(url));
  run(standalone, `navigator.userAgent='Mozilla/5.0 (iPhone) AppleWebKit/605.1.15';
    navigator.standalone=true;document.visibilityState='visible';beginAuthorization();beginAuthorization();`);
  assert.equal(opened.length, 1, 'a repeated activation must not open a second OAuth window');
  assert.equal(opened[0].target, '_blank');
  assert.equal(new URL(opened[0].url).pathname, '/auth/google/start');
  assert.equal(new URL(opened[0].url).searchParams.get('returnTo'), '/drive-original/');
  assert.equal(authWindow.opener, null);
  assert.deepEqual(assigned, []);
  assert.equal(run(standalone, 'standaloneAuthAttempt !== null'), true);
  assert.equal(run(standalone, 'authUi.buttonLabel.textContent'), 'Google 로그인 진행 중…');
  assert.equal(run(standalone, 'el.authHint.textContent'), '열려 있는 Google 로그인 창을 완료한 뒤 이 화면으로 돌아오세요.');

  for (const fixture of [
    { name: 'iPhone browser tab', userAgent: 'Mozilla/5.0 (iPhone)', standalone: false, display: false },
    { name: 'desktop standalone', userAgent: 'Mozilla/5.0 (Windows NT 10.0)', standalone: false, display: true },
    { name: 'Android standalone', userAgent: 'Mozilla/5.0 (Linux; Android 15)', standalone: false, display: true }
  ]) {
    const context = loadAppContext();
    installAuthUi(context);
    const navigations = [];
    let popupCalls = 0;
    context.location.assign = (url) => navigations.push(String(url));
    context.window.open = () => { popupCalls += 1; return {}; };
    context.window.matchMedia = () => ({ matches: fixture.display });
    run(context, `navigator.userAgent=${JSON.stringify(fixture.userAgent)};
      navigator.standalone=${fixture.standalone};beginAuthorization();`);
    assert.equal(popupCalls, 0, fixture.name);
    assert.equal(navigations.length, 1, fixture.name);
  }
});

test('a blocked standalone OAuth window fails closed and releases the connect action', () => {
  const context = loadAppContext();
  installAuthUi(context);
  context.window.open = () => null;
  context.location.assign = () => { throw new Error('standalone must not fall back to cross-context navigation'); };
  run(context, `navigator.userAgent='Mozilla/5.0 (iPhone) AppleWebKit/605.1.15';
    navigator.standalone=true;beginAuthorization();`);
  assert.equal(run(context, 'standaloneAuthAttempt'), null);
  assert.equal(run(context, 'el.connectButton.disabled'), false);
  assert.equal(run(context, 'el.setupView.hidden'), false);
  assert.match(run(context, 'el.authHint.textContent'), /로그인 창을 열지 못했습니다/);
});

test('standalone popup and deadline failures preserve an already usable session', async () => {
  const blocked = loadAppContext();
  installAuthUi(blocked);
  blocked.window.open = () => null;
  run(blocked, `navigator.userAgent='Mozilla/5.0 (iPhone) AppleWebKit/605.1.15';navigator.standalone=true;
    state.token='still-usable';state.expiresAt=Date.now()+60000;sessionCredentialMarker='a'.repeat(43);
    el.setupView.hidden=true;el.libraryView.hidden=false;globalThis.failureToast='';showToast=(message)=>{failureToast=message;};
    beginAuthorization();`);
  assert.equal(run(blocked, 'state.token'), 'still-usable');
  assert.equal(run(blocked, 'el.setupView.hidden'), true);
  assert.equal(run(blocked, 'el.libraryView.hidden'), false);
  assert.match(run(blocked, 'failureToast'), /로그인 창을 열지 못했습니다/);

  const expired = loadAppContext();
  installAuthUi(expired);
  const clock = installFakeClock(expired);
  expired.window.open = () => ({ opener: expired.window });
  run(expired, `navigator.userAgent='Mozilla/5.0 (iPhone) AppleWebKit/605.1.15';navigator.standalone=true;
    document.visibilityState='visible';state.token='still-usable';state.expiresAt=Date.now()+60000;
    sessionCredentialMarker='a'.repeat(43);el.setupView.hidden=true;el.libraryView.hidden=false;
    globalThis.failureToast='';showToast=(message)=>{failureToast=message;};requestSessionCredential=async()=>true;
    beginAuthorization();markStandaloneAuthorizationReturned({pageshow:true});resumeStandaloneAuthorization();`);
  for (const delay of [0, 800, 2_000]) {
    clock.advance(delay);
    await new Promise((resolve) => setImmediate(resolve));
  }
  clock.advance(600_000 - 2_800);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(run(expired, 'state.token'), 'still-usable');
  assert.equal(run(expired, 'el.setupView.hidden'), true);
  assert.equal(run(expired, 'el.libraryView.hidden'), false);
  assert.match(run(expired, 'failureToast'), /로그인 시간이 만료되었습니다/);
});

test('standalone foreground recovery is single-owner, survives one early 401, and opens the library on credential proof', async () => {
  const context = loadAppContext();
  installAuthUi(context);
  const clock = installFakeClock(context);
  context.window.open = () => ({ opener: context.window });
  run(context, `navigator.userAgent='Mozilla/5.0 (iPhone) AppleWebKit/605.1.15';
    navigator.standalone=true;document.visibilityState='visible';
    globalThis.recoveryCalls=0;globalThis.libraryShows=0;
    showLibrary=()=>{libraryShows+=1;el.setupView.hidden=true;el.libraryView.hidden=false;};
    requestSessionCredential=async()=>{
      recoveryCalls+=1;
      if(recoveryCalls===1)return false;
      state.token='standalone-session-token';state.expiresAt=Date.now()+60000;
      sessionCredentialMarker='b'.repeat(43);return true;
    };
    beginAuthorization();markStandaloneAuthorizationHidden();document.visibilityState='visible';markStandaloneAuthorizationReturned();
    resumeStandaloneAuthorization();resumeStandaloneAuthorization();`);
  assert.equal(clock.scheduled.size, 2);
  clock.advance(0);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(run(context, 'recoveryCalls'), 1);
  assert.equal(clock.scheduled.size, 2, 'one bounded retry and one transaction deadline should remain armed after an early 401');
  run(context, 'resumeStandaloneAuthorization();resumeStandaloneAuthorization();');
  assert.equal(clock.scheduled.size, 2, 'foreground event bursts must not duplicate the retry owner or deadline');
  clock.advance(800);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(run(context, 'recoveryCalls'), 2);
  assert.equal(run(context, 'libraryShows'), 1);
  assert.equal(run(context, 'standaloneAuthAttempt'), null);
  assert.equal(run(context, 'el.connectButton.disabled'), false);
  assert.equal(run(context, 'el.libraryView.hidden'), false);
});

test('standalone recovery requires a new HttpOnly-session marker instead of any usable token or revision change', async () => {
  const context = loadAppContext();
  installAuthUi(context);
  const clock = installFakeClock(context);
  context.window.open = () => ({ opener: context.window });
  run(context, `navigator.userAgent='Mozilla/5.0 (iPhone) AppleWebKit/605.1.15';
    navigator.standalone=true;document.visibilityState='visible';
    state.token='old-token';state.expiresAt=Date.now()+60000;state.tokenRevision=8;
    sessionCredentialMarker='a'.repeat(43);globalThis.recoveryCalls=0;globalThis.libraryShows=0;
    showLibrary=()=>{libraryShows+=1;};
    requestSessionCredential=async()=>{
      recoveryCalls+=1;state.token='refreshed-token';state.expiresAt=Date.now()+60000;state.tokenRevision+=1;
      if(recoveryCalls===2)sessionCredentialMarker='b'.repeat(43);
      return true;
    };
    beginAuthorization();markStandaloneAuthorizationHidden();markStandaloneAuthorizationReturned();resumeStandaloneAuthorization();`);
  clock.advance(0);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(run(context, 'recoveryCalls'), 1);
  assert.equal(run(context, 'libraryShows'), 0, 'a refresh on the old session must not impersonate OAuth completion');
  assert.equal(run(context, 'standaloneAuthAttempt !== null'), true);
  clock.advance(800);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(run(context, 'recoveryCalls'), 2);
  assert.equal(run(context, 'libraryShows'), 1);
  assert.equal(run(context, 'standaloneAuthAttempt'), null);
});

test('a standalone recovery timer that fires while hidden consumes no probe budget', async () => {
  const context = loadAppContext();
  installAuthUi(context);
  const clock = installFakeClock(context);
  context.window.open = () => ({ opener: context.window });
  run(context, `navigator.userAgent='Mozilla/5.0 (iPhone) AppleWebKit/605.1.15';
    navigator.standalone=true;document.visibilityState='visible';globalThis.recoveryCalls=0;
    requestSessionCredential=async()=>{recoveryCalls+=1;state.token='new-token';state.expiresAt=Date.now()+60000;
      sessionCredentialMarker='z'.repeat(43);return true;};
    beginAuthorization();markStandaloneAuthorizationHidden();markStandaloneAuthorizationReturned();resumeStandaloneAuthorization();
    document.visibilityState='hidden';`);
  clock.advance(0);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(run(context, 'recoveryCalls'), 0);
  assert.equal(run(context, 'standaloneAuthAttempt.nextProbe'), 0);
  assert.equal(run(context, 'standaloneAuthAttempt.timer'), null);
  run(context, `document.visibilityState='visible';markStandaloneAuthorizationReturned();resumeStandaloneAuthorization();`);
  clock.advance(0);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(run(context, 'recoveryCalls'), 1);
  assert.equal(run(context, 'standaloneAuthAttempt'), null);
});

test('pageshow alone can resume standalone recovery and a later return gets a fresh bounded probe epoch', async () => {
  const context = loadAppContext();
  installAuthUi(context);
  const clock = installFakeClock(context);
  context.window.open = () => ({ opener: context.window });
  run(context, `navigator.userAgent='Mozilla/5.0 (iPhone) AppleWebKit/605.1.15';
    navigator.standalone=true;document.visibilityState='visible';globalThis.recoveryCalls=0;globalThis.libraryShows=0;
    globalThis.callbackReady=false;showLibrary=()=>{libraryShows+=1;};
    requestSessionCredential=async()=>{recoveryCalls+=1;if(!callbackReady)return false;
      state.token='new-session';state.expiresAt=Date.now()+60000;sessionCredentialMarker='p'.repeat(43);return true;};
    beginAuthorization();markStandaloneAuthorizationReturned({pageshow:true});resumeStandaloneAuthorization();`);
  for (const delay of [0, 800, 2_000]) {
    clock.advance(delay);
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.equal(run(context, 'recoveryCalls'), 3);
  assert.equal(run(context, 'standaloneAuthAttempt.waitingForReturn'), true);
  assert.equal(run(context, 'standaloneAuthAttempt !== null'), true);
  run(context, `callbackReady=true;markStandaloneAuthorizationReturned({pageshow:true});resumeStandaloneAuthorization();`);
  clock.advance(0);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(run(context, 'recoveryCalls'), 4);
  assert.equal(run(context, 'libraryShows'), 1);
  assert.equal(run(context, 'standaloneAuthAttempt'), null);
});

test('standalone recovery expires at the OAuth transaction deadline and stale completion cannot revive it', async () => {
  const failed = loadAppContext();
  installAuthUi(failed);
  const failureClock = installFakeClock(failed);
  failed.window.open = () => ({ opener: failed.window });
  run(failed, `navigator.userAgent='Mozilla/5.0 (iPhone) AppleWebKit/605.1.15';
    navigator.standalone=true;document.visibilityState='visible';
    globalThis.recoveryCalls=0;requestSessionCredential=async()=>{recoveryCalls+=1;return false;};
    beginAuthorization();markStandaloneAuthorizationHidden();markStandaloneAuthorizationReturned();resumeStandaloneAuthorization();`);
  for (const delay of [0, 800, 2_000]) {
    failureClock.advance(delay);
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.equal(run(failed, 'recoveryCalls'), 3);
  assert.equal(run(failed, 'standaloneAuthAttempt.waitingForReturn'), true);
  assert.equal(run(failed, 'standaloneAuthAttempt !== null'), true);
  assert.equal(run(failed, 'el.connectButton.disabled'), true);
  failureClock.advance(600_000 - 2_800);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(run(failed, 'standaloneAuthAttempt'), null);
  assert.equal(run(failed, 'el.connectButton.disabled'), false);
  assert.match(run(failed, 'el.authHint.textContent'), /로그인 시간이 만료되었습니다/);

  const stale = loadAppContext();
  installAuthUi(stale);
  const staleClock = installFakeClock(stale);
  stale.window.open = () => ({ opener: stale.window });
  let release;
  stale.releaseCredential = () => release?.();
  run(stale, `navigator.userAgent='Mozilla/5.0 (iPhone) AppleWebKit/605.1.15';
    navigator.standalone=true;document.visibilityState='visible';globalThis.libraryShows=0;
    showLibrary=()=>{libraryShows+=1;};
    requestSessionCredential=async()=>{await new Promise(resolve=>{globalThis.releaseRecovery=resolve;});
      state.token='late-token';state.expiresAt=Date.now()+60000;sessionCredentialMarker='c'.repeat(43);return true;};
    beginAuthorization();markStandaloneAuthorizationHidden();markStandaloneAuthorizationReturned();resumeStandaloneAuthorization();`);
  staleClock.advance(0);
  await new Promise((resolve) => setImmediate(resolve));
  run(stale, 'clearStandaloneAuthAttempt();releaseRecovery();');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(run(stale, 'libraryShows'), 0);
  assert.equal(run(stale, 'standaloneAuthAttempt'), null);
});

test('standalone deadline generation-fences a real credential response that resolves late', async () => {
  const context = loadAppContext();
  installAuthUi(context);
  const clock = installFakeClock(context);
  context.window.open = () => ({ opener: context.window });
  let release;
  let calls = 0;
  context.fetch = async () => {
    calls += 1;
    await new Promise((resolve) => { release = resolve; });
    return new Response(JSON.stringify({
      capabilities: { version: 1, driveRead: true, driveWrite: true, appData: true }, accessToken: 'must-not-install', expiresAt: Date.now() + 60_000, account: 'account-A', revision: 1,
      sessionMarker: 'l'.repeat(43)
    }), { headers: { 'Content-Type': 'application/json' } });
  };
  run(context, `navigator.userAgent='Mozilla/5.0 (iPhone) AppleWebKit/605.1.15';
    navigator.standalone=true;document.visibilityState='visible';
    scheduleTokenRenewal=()=>{};resumeAfterCredential=()=>{};sendTokenToWorker=()=>{};
    beginAuthorization();markStandaloneAuthorizationReturned({pageshow:true});resumeStandaloneAuthorization();`);
  clock.advance(0);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls, 1);
  clock.advance(600_000);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(run(context, 'standaloneAuthAttempt'), null);
  assert.equal(run(context, 'state.authGeneration'), 1);
  release();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(run(context, 'state.token'), null);
  assert.equal(run(context, 'sessionCredentialMarker'), null);
  assert.equal(run(context, 'el.libraryView.hidden'), true);
  assert.match(run(context, 'el.authHint.textContent'), /로그인 시간이 만료되었습니다/);
});

test('offline and non-JSON credential failures are bounded and preserve the current memory credential', async () => {
  const context = loadAppContext(); let calls = 0;
  const clock = installFakeClock(context);
  context.fetch = async () => {
    calls += 1;
    return new Response('temporarily unavailable', { status: 503, headers: { 'Content-Type': 'text/plain' } });
  };
  run(context, `state.authAccountKey='account-A';state.token='still-valid';state.expiresAt=Date.now()+60_000;state.tokenRevision=5;
    el.connectionBadge={dataset:{},querySelector(){return null}};el.authHint={textContent:'',classList:{add(){},remove(){}}};`);
  const pending = run(context, 'requestSessionCredential({background:true,force:true})');
  await flushCredentialTasks();
  clock.advance(1_250); await flushCredentialTasks();
  clock.advance(2_500); await flushCredentialTasks();
  assert.equal(await pending, false);
  assert.equal(run(context, 'state.token'), 'still-valid');
  run(context, 'navigator.onLine=false');
  assert.equal(await run(context, 'requestSessionCredential({background:true,force:true})'), false);
  assert.equal(calls, 3);
  assert.equal(run(context, 'state.token'), 'still-valid');
});

test('concurrent credential waiters share one bounded failed flight without parallel fetches', async () => {
  const context = loadAppContext(); let calls = 0; let release;
  const clock = installFakeClock(context);
  context.fetch = async () => {
    calls += 1;
    if (calls === 1) await new Promise((resolve) => { release = resolve; });
    return new Response(JSON.stringify({ error: { code: 'auth_unavailable' } }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  };
  run(context, `el.connectionBadge={dataset:{},querySelector(){return null}};el.authHint={textContent:'',classList:{add(){},remove(){}}};`);
  const first = run(context, 'requestSessionCredential({background:true,force:true})');
  const second = run(context, 'requestSessionCredential({background:true,force:true})');
  release();
  await flushCredentialTasks();
  clock.advance(1_250); await flushCredentialTasks();
  clock.advance(2_500); await flushCredentialTasks();
  assert.deepEqual(await Promise.all([first, second]), [false, false]);
  assert.equal(calls, 3);
});

async function flushCredentialTasks() {
  for (let attempt = 0; attempt < 8; attempt++) await new Promise(resolve => setImmediate(resolve));
}

function renewalFixture() {
  const context = loadAppContext();
  const clock = installFakeClock(context);
  context.Date = class extends Date { static now() { return clock.now(); } };
  run(context, `document.visibilityState='visible';
    state.authAccountKey='account-A';state.token='old';state.expiresAt=Date.now()+120000;state.tokenRevision=7;
    resumeAfterCredential=()=>{};sendTokenToWorker=()=>{};clearAuthError=()=>{};updateConnectionBadge=()=>{};`);
  const fresh = () => new Response(JSON.stringify({ capabilities: { version: 1, driveRead: true, driveWrite: true, appData: true },
    account: 'account-A', accessToken: 'fresh', revision: 8, expiresAt: clock.now() + 3600000 }),
  { headers: { 'Content-Type': 'application/json' } });
  const error = (code = 'auth_unavailable', status = 503) => new Response(JSON.stringify({ error: { code } }),
    { status, headers: { 'Content-Type': 'application/json' } });
  const advance = async ms => { clock.advance(ms); await flushCredentialTasks(); };
  return { context, clock, fresh, error, advance };
}

test('natural renewal has total-flight runway and forces one atomic newer owner revision before its cache window', async () => {
  const { AccountCredentialOwner } = await import('../auth/session-owner.mjs');
  const { REQUESTED_GOOGLE_SCOPES } = await import('../auth/scope-policy.mjs');
  const f = renewalFixture();
  let stored = {}, refreshes = 0, sequence = 0;
  const owner = new AccountCredentialOwner({
    storage: { async transaction(fn) { const next = structuredClone(stored), result = fn(next); stored = next; return structuredClone(result); } },
    account: 'account-A', clock: f.clock.now, hash: async value => value, random: () => String(++sequence),
    encrypt: async value => value, decrypt: async value => value, revoke: async () => true,
    refresh: async () => { refreshes++; return { accessToken: 'fresh', expiresAt: f.clock.now() + 3600000 }; }
  });
  const established = await owner.establishVerifiedSession({ account: 'account-A', accessToken: 'old',
    expiresAt: f.clock.now() + 120000, refreshToken: 'fixture', grantedScopes: REQUESTED_GOOGLE_SCOPES });
  run(f.context, `state.tokenRevision=${established.credential.revision}`);
  const calls = [];
  f.context.fetch = async (_, init) => {
    const body = JSON.parse(init.body); calls.push({ at: f.clock.now(), body });
    const credential = await owner.credential({ sessionId: established.sessionId, ...body });
    return new Response(JSON.stringify(credential), { headers: { 'Content-Type': 'application/json' } });
  };
  run(f.context, 'scheduleTokenRenewal()');
  const first = f.clock.captured.at(-1);
  assert.equal(first.delay, 30000, '120s lifetime leaves90s including30s skew,55s flight and5s margin');
  await f.advance(30000);
  assert.equal(calls.length, 1); assert.equal(calls[0].body.rejectedRevision, established.credential.revision);
  assert.equal(refreshes, 1); assert.equal(run(f.context, 'state.tokenRevision'), established.credential.revision + 1);
  assert.equal(f.clock.scheduled.size, 1, 'only the next credential renewal owns a timer');
});

test('natural renewal retains one visible online retry after a bounded transient flight and then recovers', async () => {
  const f = renewalFixture(); let calls = 0;
  f.context.fetch = async () => ++calls <= 3 ? f.error() : f.fresh();
  run(f.context, 'scheduleTokenRenewal()');
  await f.advance(30000); await f.advance(1250); await f.advance(2500);
  assert.equal(calls, 3); assert.equal(f.clock.scheduled.size, 1);
  assert.equal(f.clock.captured.at(-1).delay, 15000);
  await f.advance(15000);
  assert.equal(calls, 4); assert.equal(run(f.context, 'state.tokenRevision'), 8);
  assert.equal(f.clock.scheduled.size, 1);
});

test('a long transient outage retains one serialized renewal timer beyond expiry and recovers', async () => {
  const f = renewalFixture(); let calls = 0;
  const originalExpiry = run(f.context, 'state.expiresAt');
  f.context.fetch = async () => ++calls <= 18 ? f.error() : f.fresh();
  run(f.context, 'scheduleTokenRenewal()');
  await f.advance(30000);
  for (let flight = 0; flight < 6; flight++) {
    await f.advance(1250); await f.advance(2500);
    assert.equal(calls, (flight + 1) * 3);
    assert.equal(f.clock.scheduled.size, 1, 'one successor, no parallel flight or accumulated timers');
    assert.equal(run(f.context, 'credentialRequestPromise'), null);
    assert.equal(f.clock.captured.at(-1).delay, 15000);
    if (flight < 5) await f.advance(15000);
  }
  assert.ok(f.clock.now() > originalExpiry, 'recovery remains possible after the old credential expires');
  assert.equal(run(f.context, 'state.tokenRevision'), 7);
  await f.advance(15000);
  assert.equal(calls, 19); assert.equal(run(f.context, 'state.tokenRevision'), 8);
  assert.equal(f.clock.scheduled.size, 1, 'fresh owner now holds only its normal renewal timer');
  run(f.context, 'clearToken(false)');
  assert.equal(f.clock.scheduled.size, 0);
});

test('natural retry suppresses hidden/offline and stale account, generation, revision or expiry owners', async () => {
  for (const invalidation of ["document.visibilityState='hidden'", 'navigator.onLine=false',
    "state.authAccountKey='account-B'", 'state.authGeneration++', 'state.tokenRevision++', 'state.expiresAt++']) {
    const f = renewalFixture(); let calls = 0;
    f.context.fetch = async () => { calls++; return f.error(); };
    run(f.context, 'scheduleTokenRenewal()');
    await f.advance(30000); await f.advance(1250); await f.advance(2500);
    run(f.context, invalidation); await f.advance(15000);
    assert.equal(calls, 3, invalidation); assert.equal(f.clock.scheduled.size, 0, invalidation);
  }
  const f = renewalFixture();
  f.context.fetch = async () => { throw new Error('stale callback cannot fetch'); };
  run(f.context, 'scheduleTokenRenewal()');
  const oldCallback = f.clock.captured.at(-1).callback;
  run(f.context, 'scheduleTokenRenewal()');
  const newOwner = run(f.context, 'tokenRenewalTimer');
  await oldCallback();
  assert.equal(run(f.context, 'tokenRenewalTimer'), newOwner);
  assert.equal(f.clock.scheduled.size, 1);
});

test('credential retry does not retry terminal outcomes or misleading terminal503 payloads', async () => {
  for (const [code, status] of [['unauthorized',401], ['reconnect_required',401], ['account_mismatch',409],
    ['client_update_required',409], ['forbidden',403], ['stale_revision',409], ['client_update_required',503], ['auth_unavailable',500]]) {
    const f = renewalFixture(); let calls = 0;
    f.context.fetch = async () => { calls++; return f.error(code, status); };
    run(f.context, 'scheduleTokenRenewal()'); await f.advance(30000);
    assert.equal(calls, 1, code); assert.equal(f.clock.scheduled.size, 0, code);
  }
});

test('credential network and503 retries share the original55s total deadline across attempts', async () => {
  const f = renewalFixture(); let calls = 0;
  f.context.fetch = async (_, { signal }) => {
    calls++;
    if (calls === 1) return f.error();
    return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
  };
  const pending = run(f.context, 'requestSessionCredential({background:true,force:true})');
  await flushCredentialTasks(); await f.advance(1250); await f.advance(53750);
  assert.equal(await pending, false); assert.equal(calls, 2); assert.equal(f.clock.scheduled.size, 0);
  const network = renewalFixture(); let attempts = 0;
  network.context.fetch = async () => {
    if (++attempts === 1) throw new TypeError('synthetic network loss');
    return attempts === 2 ? network.error() : network.fresh();
  };
  const recovered = run(network.context, 'requestSessionCredential({background:true,force:true})');
  await flushCredentialTasks(); await network.advance(1250); await network.advance(2500);
  assert.equal(await recovered, true); assert.equal(attempts, 3);
});

test('clearing during credential retry delay prevents another attempt and isolates the next generation outcome', async () => {
  const f = renewalFixture(); let calls = 0;
  f.context.fetch = async () => { calls++; return f.error(); };
  const pending = run(f.context, 'requestSessionCredential({background:true,force:true})');
  await flushCredentialTasks();
  const oldOutcome = run(f.context, 'credentialRequestOutcome');
  run(f.context, 'clearToken(false)');
  assert.equal(await pending, false); assert.equal(f.clock.scheduled.size, 0);
  f.context.fetch = async () => { calls++; return f.error('forbidden',403); };
  const next = run(f.context, 'requestSessionCredential({background:true,force:true})');
  assert.equal(await next, false);
  const nextOutcome = run(f.context, 'credentialRequestOutcome');
  assert.notEqual(oldOutcome, nextOutcome); assert.equal(nextOutcome.retryable, false);
  await f.advance(60000); assert.equal(calls, 2); assert.equal(f.clock.scheduled.size, 0);
});

test('a competing same-generation credential flight cannot inherit an older renewal callback', async () => {
  const f = renewalFixture(); let calls = 0, release;
  f.context.fetch = async () => {
    if (++calls <= 3) return f.error();
    return new Promise(resolve => { release = () => resolve(f.error('forbidden',403)); });
  };
  run(f.context, `const originalCredentialRequest=requestSessionCredential;
    let launchCompeting=true;
    requestSessionCredential=(options)=>{
      const pending=originalCredentialRequest(options);
      if(launchCompeting){launchCompeting=false;pending.then(()=>originalCredentialRequest({background:true,force:true}));}
      return pending;
    };scheduleTokenRenewal();`);
  await f.advance(30000); await f.advance(1250); await f.advance(2500);
  assert.equal(calls, 4); assert.equal(run(f.context, 'tokenRenewalTimer'), null);
  assert.equal(f.clock.scheduled.size, 1, 'only the competing flight total deadline remains');
  release(); await flushCredentialTasks();
  assert.equal(f.clock.scheduled.size, 0);
});

test('an active Q1 lease shares two503 recovery while a retiring lease receives no token', async () => {
  for (const retire of [false, true]) {
    const f = renewalFixture(); let calls = 0, reply;
    f.context.fetch = async () => ++calls <= 2 ? f.error() : f.fresh();
    run(f.context, `state.selected={id:'fixture'};state.mediaSession=7;state.driveSessionGeneration=3;mediaSourceGeneration=5;
      state.mediaAttempt='q1-playing';globalThis.currentWorker={};navigator.serviceWorker={controller:currentWorker};
      q1Playback={controller:new AbortController(),swController:currentWorker};`);
    f.context.tokenEvent = { source: run(f.context, 'currentWorker'),
      data: { type: 'TOKEN_REQUEST', requestId: 'lease', forceRefresh: true, rejectedRevision: 7,
        expectedAccount: 'account-A', accountGeneration: 3, requireCurrentMedia: true,
        fileId: 'fixture', mediaSession: '7', sourceGeneration: 5 },
      ports: [{ postMessage(value) { reply = value; }, close() {} }] };
    const pending = run(f.context, 'handleWorkerMessage(tokenEvent)');
    await flushCredentialTasks();
    if (retire) run(f.context, 'q1Playback.controller.abort()');
    await f.advance(1250); await f.advance(2500); await pending;
    assert.equal(calls, 3); assert.equal(reply.requestCurrent, !retire);
    assert.equal(reply.token, retire ? null : 'fresh');
    assert.equal(run(f.context, 'state.tokenRevision'), 8);
  }
});

function streamingCredentialResponse(f, signal, { mode = 'hang', status = 200 } = {}) {
  const bytes = new TextEncoder().encode(mode === 'syntax' ? '{"accessToken":'
    : mode === 'schema' ? JSON.stringify({ accessToken: 'incomplete' })
      : JSON.stringify({ capabilities: { version: 1, driveRead: true, driveWrite: true, appData: true },
        account: 'account-A', accessToken: 'fresh', revision: 8, expiresAt: f.clock.now() + 3600000 }));
  const stream = new ReadableStream({ start(controller) {
    let finished = false;
    const onAbort = () => {
      if (finished) return;
      finished = true; signal.removeEventListener('abort', onAbort); controller.error(signal.reason);
    };
    signal.addEventListener('abort', onAbort, { once: true });
    if (mode === 'hang') return;
    const finish = () => {
      if (finished) return;
      finished = true; signal.removeEventListener('abort', onAbort);
      if (mode === 'transport') controller.error(new TypeError('synthetic body transport loss'));
      else { controller.enqueue(bytes); controller.close(); }
    };
    if (mode === 'delayed' || mode === 'transport') f.context.setTimeout(finish, mode === 'delayed' ? 40000 : 5000);
    else finish();
  } });
  return new Response(stream, { status, headers: { 'Content-Type': 'application/json' } });
}

test('successful credential headers retain one renewal successor for body timeout or transport TypeError', async () => {
  for (const mode of ['hang', 'transport']) {
    const f = renewalFixture(); let calls = 0;
    f.context.fetch = async (_, { signal }) => {
      calls++;
      return calls === 1 ? streamingCredentialResponse(f, signal, { mode }) : f.fresh();
    };
    run(f.context, 'scheduleTokenRenewal()'); await f.advance(30000);
    assert.equal(run(f.context, 'credentialRequestOutcome.retryable'), false, 'headers alone remain unclassified as transport failure');
    await f.advance(mode === 'hang' ? 55000 : 5000);
    assert.equal(calls, 1, 'ambiguous body failure must not add in-flight HTTP replay');
    assert.equal(run(f.context, 'credentialRequestPromise'), null);
    assert.equal(run(f.context, 'credentialRequestOutcome.retryable'), true);
    assert.equal(run(f.context, 'state.tokenRevision'), 7);
    assert.equal(f.clock.scheduled.size, 1); assert.equal(f.clock.captured.at(-1).delay, 15000);
    await f.advance(15000);
    assert.equal(calls, 2); assert.equal(run(f.context, 'state.tokenRevision'), 8);
  }
});

test('delayed valid credential bodies complete normally while malformed syntax and schema remain terminal', async () => {
  for (const mode of ['valid', 'delayed', 'syntax', 'schema']) {
    const f = renewalFixture(); let calls = 0;
    f.context.fetch = async (_, { signal }) => { calls++; return streamingCredentialResponse(f, signal, { mode }); };
    run(f.context, 'scheduleTokenRenewal()'); await f.advance(30000);
    if (mode === 'delayed') await f.advance(40000);
    assert.equal(calls, 1);
    assert.equal(run(f.context, 'credentialRequestOutcome.retryable'), false);
    const valid = mode === 'valid' || mode === 'delayed';
    assert.equal(run(f.context, 'state.tokenRevision'), valid ? 8 : 7);
    assert.equal(f.clock.scheduled.size, valid ? 1 : 0);
  }
});

test('terminal credential status headers remain stopped even if their body stalls to the deadline', async () => {
  for (const status of [401, 403, 409]) {
    const f = renewalFixture(); let calls = 0;
    f.context.fetch = async (_, { signal }) => { calls++; return streamingCredentialResponse(f, signal, { status }); };
    run(f.context, 'scheduleTokenRenewal()'); await f.advance(30000); await f.advance(55000);
    assert.equal(calls, 1); assert.equal(run(f.context, 'credentialRequestOutcome.retryable'), false);
    assert.equal(f.clock.scheduled.size, 0);
  }
});

test('body cancellation cannot revive cleared generation or overwrite its new credential outcome', async () => {
  for (const cancellation of ['clear', 'generation']) {
    const f = renewalFixture(); let calls = 0;
    f.context.fetch = async (_, { signal }) => { calls++; return streamingCredentialResponse(f, signal); };
    run(f.context, 'scheduleTokenRenewal()'); await f.advance(30000);
    const oldOutcome = run(f.context, 'credentialRequestOutcome');
    run(f.context, cancellation === 'clear' ? 'clearToken(false,{preserveAccount:true})'
      : 'state.authGeneration++;credentialRequestAbortController.abort()');
    let next, newer;
    if (cancellation === 'clear') {
      f.context.fetch = async () => { calls++; return f.error('forbidden',403); };
      next = run(f.context, 'requestSessionCredential({background:true,force:true})');
      newer = run(f.context, 'credentialRequestOutcome');
    }
    await flushCredentialTasks(); await f.advance(55000);
    assert.equal(calls, cancellation === 'clear' ? 2 : 1); assert.equal(f.clock.scheduled.size, 0);
    if (cancellation === 'clear') {
      assert.equal(await next, false);
      assert.notEqual(newer, oldOutcome); assert.equal(newer.retryable, false);
      assert.equal(oldOutcome.retryable, true, 'old body abort still completes after the new owner started');
      assert.equal(run(f.context, 'credentialRequestOutcome.retryable'), false);
    }
  }
});

test('readAuthJson keeps its default null contract and transport callback excludes SyntaxError', async () => {
  const context = loadAppContext();
  let transportCallbacks = 0;
  context.noteTransport = () => { transportCallbacks++; };
  for (const [error, callback] of [[new TypeError('body transport'),false], [new TypeError('body transport'),true],
    [new DOMException('aborted','AbortError'),true], [new SyntaxError('malformed JSON'),true]]) {
    context.response = { headers: new Headers({ 'Content-Type': 'application/json' }), async json() { throw error; } };
    assert.equal(await run(context, callback ? 'readAuthJson(response,{onTransportFailure:noteTransport})' : 'readAuthJson(response)'), null);
  }
  assert.equal(transportCallbacks, 2);
});

test('cancelling a Drive credential waiter releases it while the shared refresh serves another request', async () => {
  for (const phase of ['expired', 'rejected']) {
    const context = loadAppContext();
    installAuthUi(context);
    let release, credentialCalls = 0, metadataCalls = 0, authSignal;
    context.fetch = async (url, options) => {
      if (String(url).includes('/api/session/credential')) {
        credentialCalls++; authSignal = options.signal;
        await new Promise(resolve => { release = resolve; });
        return new Response(JSON.stringify({ capabilities: { version: 1, driveRead: true, driveWrite: true, appData: true }, accessToken: 'fresh', expiresAt: Date.now() + 3600000,
          account: 'account-A', revision: 2 }), { headers: { 'Content-Type': 'application/json' } });
      }
      metadataCalls++;
      return options.headers.Authorization === 'Bearer old'
        ? new Response('{}', { status: 401, headers: { 'Content-Type': 'application/json' } })
        : new Response('{}', { headers: { 'Content-Type': 'application/json' } });
    };
    run(context, `state.authAccountKey='account-A';state.token='old';state.tokenRevision=1;
      state.expiresAt=${phase === 'expired' ? '0' : 'Date.now()+3600000'};
      scheduleTokenRenewal=()=>{};resumeAfterCredential=()=>{};sendTokenToWorker=()=>{};`);
    context.consumerController = new AbortController();
    const cancelled = run(context, `driveFetch('https://www.googleapis.com/drive/v3/files/fixture', {signal:consumerController.signal})`);
    // Attach the rejection before cancelling; no unhandled async work in test.
    const ended = assert.rejects(cancelled, { name: 'AbortError' });
    for (let attempt = 0; !release && attempt < 20; attempt++) await new Promise(resolve => setImmediate(resolve));
    assert.equal(typeof release, 'function', phase);
    const continuing = run(context, `driveFetch('https://www.googleapis.com/drive/v3/files/fixture')`);
    context.consumerController.abort();
    await ended;
    assert.equal(authSignal.aborted, false, phase);
    assert.equal(credentialCalls, 1);
    release();
    assert.equal((await continuing).status, 200);
    assert.equal(credentialCalls, 1);
    assert.equal(metadataCalls, phase === 'expired' ? 1 : 3);
    assert.equal(run(context, 'state.tokenRevision'), 2);
  }
});

function accountJsonReadFixture() {
  const context=loadAppContext(),clock=installFakeClock(context),parent=new AbortController(),listeners=new Set();
  const add=parent.signal.addEventListener.bind(parent.signal),remove=parent.signal.removeEventListener.bind(parent.signal);
  parent.signal.addEventListener=(type,fn,options)=>{if(type==='abort')listeners.add(fn);add(type,fn,options)};
  parent.signal.removeEventListener=(type,fn)=>{if(type==='abort')listeners.delete(fn);remove(type,fn)};
  context.parentRead=parent;context.readClock=clock;
  run(context,"Date.now=()=>readClock.now();state.token='read-token';state.expiresAt=Date.now()+3600000;state.accountId='reader';state.authAccountKey='reader-key'");
  return {context,clock,parent,listeners,read:()=>run(context,"readAccountStateJson('https://www.googleapis.com/drive/v3/files/state?alt=media',{signal:parentRead.signal})")};
}

test('account JSON deadline aborts stalled headers and success/error bodies and cancels late headers', async () => {
  for(const phase of ['headers','success-body','error-body']) {
    const f=accountJsonReadFixture();let requestSignal,release,bodyCancels=0,bodySettled=0;
    f.context.fetch=async(_url,options)=>{
      requestSignal=options.signal;assert.equal(Reflect.ownKeys(options).some(key=>typeof key==='symbol'),false);
      if(phase==='headers')return new Promise(resolve=>{release=resolve});
      let streamController;
      const response=new Response(new ReadableStream({start(controller){streamController=controller}}),{status:phase==='error-body'?401:200});
      const abort=()=>{requestSignal.removeEventListener('abort',abort);streamController.error(new DOMException('aborted','AbortError'))};
      requestSignal.addEventListener('abort',abort,{once:true});
      const json=response.json.bind(response),cancel=response.body.cancel.bind(response.body);
      response.json=async()=>{try{return await json()}finally{bodySettled++;requestSignal.removeEventListener('abort',abort)}};
      response.body.cancel=()=>{bodyCancels++;return cancel()};return response;
    };
    run(f.context,"requestSessionCredential=()=>{throw Error('stalled error body must not request OAuth')}");
    const pending=f.read(),rejected=assert.rejects(pending,{name:'TimeoutError',code:'account_state_read_timeout',status:408});
    await new Promise(resolve=>setImmediate(resolve));f.clock.advance(30000);await rejected;
    assert.equal(requestSignal.aborted,true,phase);assert.equal(f.clock.scheduled.size,0);assert.equal(f.listeners.size,0);
    if(phase==='headers'){
      const late=new Response('{}'),cancel=late.body.cancel.bind(late.body);late.body.cancel=()=>{bodyCancels++;return cancel()};
      release(late);await new Promise(resolve=>setImmediate(resolve));assert.equal(late.bodyUsed,true);
    }else assert.equal(bodySettled,1,`${phase} reader settles after abort`);
    assert.ok(bodyCancels>0,`${phase} owned response body cancellation is attempted`);
  }
});

test('account JSON parent cancellation and stale account owners never become timeouts or leak listeners', async () => {
  for(const change of ['pre-abort','parent-abort','generation','data-generation','account-key','account-id']) {
    const f=accountJsonReadFixture();let signal,calls=0;
    f.context.fetch=async(_url,options)=>{calls++;signal=options.signal;return new Promise(()=>{})};
    if(change==='pre-abort')f.parent.abort();
    const rejected=assert.rejects(f.read(),{name:'AbortError'});
    if(change==='parent-abort')f.parent.abort();
    else if(change!=='pre-abort'){
      run(f.context,({'generation':'state.authGeneration++','data-generation':'state.driveSessionGeneration++',
        'account-key':"state.authAccountKey='other'",'account-id':"state.accountId='other'"})[change]);
      f.clock.advance(30000);
    }
    await rejected;assert.equal(calls,change==='pre-abort'?0:1);if(signal)assert.equal(signal.aborted,true);
    assert.equal(f.clock.scheduled.size,0);assert.equal(f.listeners.size,0);
  }
});

test('account JSON preserves strict parsing, HTTP errors and existing auth/rate retries within one read budget', async () => {
  for(const mode of ['success','syntax','http-error','auth-retry','rate-retry']) {
    const f=accountJsonReadFixture();let calls=0,refreshes=0;const signals=[];
    f.context.fetch=async(_url,options)=>{
      calls++;signals.push(options.signal);
      if(mode==='syntax')return new Response('{');
      if(mode==='http-error')return new Response(JSON.stringify({error:{message:'denied',errors:[{reason:'domainPolicy'}]}}),{status:403});
      if(calls===1&&mode==='auth-retry')return new Response('{}',{status:401});
      if(calls===1&&mode==='rate-retry')return new Response('{}',{status:429,headers:{'Retry-After':'1'}});
      return new Response('{"valid":true}');
    };
    f.context.countReadRefresh=()=>{refreshes++};
    run(f.context,"requestSessionCredential=async()=>{countReadRefresh();state.token='fresh';state.tokenRevision++;return true}");
    const pending=f.read();
    if(mode==='rate-retry'){await new Promise(resolve=>setImmediate(resolve));f.clock.advance(1000);}
    if(mode==='syntax')await assert.rejects(pending,{name:'SyntaxError'});
    else if(mode==='http-error')await assert.rejects(pending,error=>error.status===403&&error.driveReason==='domainPolicy');
    else assert.equal((await pending).valid,true);
    assert.equal(calls,['auth-retry','rate-retry'].includes(mode)?2:1);assert.equal(refreshes,mode==='auth-retry'?1:0);
    assert.equal(new Set(signals).size,1,'all read retries share the same deadline and child signal');
    assert.equal(f.clock.captured.filter(timer=>timer.delay===30000).length,1);
    assert.equal(f.clock.scheduled.size,0);assert.equal(f.listeners.size,0);
  }
  const f=accountJsonReadFixture();let calls=0;f.context.fetch=()=>{calls++;throw Error('must not send')};
  await assert.rejects(run(f.context,"readAccountStateJson('https://www.googleapis.com/upload/drive/v3/files',{method:'POST'})"),error=>error.code==='account_state_read_method');
  assert.equal(calls,0);assert.equal(f.clock.scheduled.size,0);
});

test('ordinary original media fetch remains streaming without an account JSON deadline', async () => {
  const f=accountJsonReadFixture();const stream=new ReadableStream({start(){}}),response=new Response(stream);let signal;
  f.context.fetch=async(_url,options)=>{signal=options.signal;return response};
  assert.equal(await run(f.context,"driveFetch('https://www.googleapis.com/drive/v3/files/original?alt=media')"),response);
  assert.equal(response.bodyUsed,false);assert.equal(signal,undefined);assert.equal(f.clock.scheduled.size,0);
  await response.body.cancel();
});

test('foreground rechecks use wall-clock expiry and one shared refresh while hidden/offline stay idle', async () => {
  const context = loadAppContext();
  installAuthUi(context);
  let release, calls = 0;
  context.fetch = async () => {
    calls++;
    await new Promise(resolve => { release = resolve; });
    return new Response(JSON.stringify({ capabilities: { version: 1, driveRead: true, driveWrite: true, appData: true }, accessToken: 'fresh', expiresAt: Date.now() + 3600000,
      account: 'account-A', revision: 2 }), { headers: { 'Content-Type': 'application/json' } });
  };
  run(context, `state.authAccountKey='account-A';state.token='expired';state.expiresAt=Date.now()-1;state.tokenRevision=1;
    scheduleTokenRenewal=()=>{};resumeAfterCredential=()=>{};sendTokenToWorker=()=>{};
    document.visibilityState='hidden';refreshForegroundCredential();
    document.visibilityState='visible';navigator.onLine=false;refreshForegroundCredential();`);
  assert.equal(calls, 0);
  run(context, `navigator.onLine=true;refreshForegroundCredential();refreshForegroundCredential();refreshForegroundCredential();`);
  assert.equal(calls, 1);
  release();
  assert.equal(await run(context, 'credentialRequestPromise'), true);
  assert.equal(run(context, 'state.tokenRevision'), 2);
});

test('a Q1 token reply authorizes only the same player source that survived the shared refresh', async () => {
  for (const replacement of ['none', 'close', 'seek']) {
    const context = loadAppContext(); installAuthUi(context);
    let release, reply;
    context.fetch = async () => {
      await new Promise(resolve => { release = resolve; });
      return new Response(JSON.stringify({ capabilities: { version: 1, driveRead: true, driveWrite: true, appData: true }, accessToken: 'fresh', expiresAt: Date.now() + 3600000,
        account: 'account-A', revision: 2 }), { headers: { 'Content-Type': 'application/json' } });
    };
    run(context, `state.authAccountKey='account-A';state.token='old';state.expiresAt=Date.now()+3600000;state.tokenRevision=1;
      state.selected={id:'fixture'};state.mediaSession=7;state.driveSessionGeneration=3;mediaSourceGeneration=5;
      state.mediaAttempt='q1-probing';q1Playback={controller:new AbortController()};
      scheduleTokenRenewal=()=>{};resumeAfterCredential=()=>{};sendTokenToWorker=()=>{};`);
    context.tokenEvent = { data: { type: 'TOKEN_REQUEST', requestId: 'media-lease', forceRefresh: true,
      expectedAccount: 'account-A', accountGeneration: 3, rejectedRevision: 1,
      requireCurrentMedia: true, fileId: 'fixture', mediaSession: '7', sourceGeneration: 5 },
      ports: [{ postMessage(value) { reply = value; }, close() {} }] };
    const pending = run(context, 'handleWorkerMessage(tokenEvent)');
    if (replacement === 'close') run(context, 'q1Playback=null');
    if (replacement === 'seek') run(context, 'mediaSourceGeneration++');
    release(); await pending;
    assert.equal(reply.requestCurrent, replacement === 'none');
    assert.equal(reply.token, replacement === 'none' ? 'fresh' : null);
    assert.equal(run(context, 'state.tokenRevision'), 2, 'global refresh can still serve current consumers');
  }
});

test('a credential response parsed after its account generation changes cannot install', async () => {
  const context = loadAppContext(); let release;
  context.fetch = async () => ({
    ok: true,
    headers: new Headers({ 'Content-Type': 'application/json' }),
    json: async () => {
      await new Promise((resolve) => { release = resolve; });
      return { capabilities: { version: 1, driveRead: true, driveWrite: true, appData: true }, accessToken: 'late-token', expiresAt: Date.now() + 60_000, account: 'account-A', revision: 2 };
    }
  });
  run(context, `state.authAccountKey='account-A';state.token='current-token';state.expiresAt=Date.now()+60_000;state.tokenRevision=1;
    el.connectionBadge={dataset:{},querySelector(){return null}};el.authHint={textContent:'',classList:{add(){},remove(){}}};`);
  const pending = run(context, 'requestSessionCredential({background:true,force:true})');
  for (let index = 0; index < 4 && !release; index++) await Promise.resolve();
  assert.equal(typeof release, 'function');
  run(context, 'state.authGeneration += 1');
  release();
  assert.equal(await pending, false);
  assert.equal(run(context, 'state.token'), 'current-token');
  assert.equal(run(context, 'state.tokenRevision'), 1);
});

test('account and revision fences reject stale credentials without replacing the current account', () => {
  const context = loadAppContext();
  const result = JSON.parse(run(context, `(() => {
    scheduleTokenRenewal=()=>{};clearAuthError=()=>{};sendTokenToWorker=()=>{};updateConnectionBadge=()=>{};resumeAfterCredential=()=>{};
    state.authAccountKey='account-A';state.token='current';state.expiresAt=Date.now()+60_000;state.tokenRevision=5;
    const results = [
      installSessionCredential({capabilities: { version: 1, driveRead: true, driveWrite: true, appData: true }, accessToken:'other-account',expiresAt:Date.now()+60_000,account:'account-B',revision:6},{generation:state.authGeneration}),
      installSessionCredential({capabilities: { version: 1, driveRead: true, driveWrite: true, appData: true }, accessToken:'stale',expiresAt:Date.now()+60_000,account:'account-A',revision:4},{generation:state.authGeneration}),
      installSessionCredential({capabilities: { version: 1, driveRead: true, driveWrite: true, appData: true }, accessToken:'changed-same-revision',expiresAt:Date.now()+60_000,account:'account-A',revision:5},{generation:state.authGeneration}),
      installSessionCredential({capabilities: { version: 1, driveRead: true, driveWrite: true, appData: true }, accessToken:'same-text',expiresAt:Date.now()+60_000,account:'account-A',revision:6},{generation:state.authGeneration})
    ];
    return JSON.stringify({results,account:state.authAccountKey,token:state.token,revision:state.tokenRevision});
  })()`));
  assert.deepEqual(result, { results: [false, false, false, true], account: 'account-A', token: 'same-text', revision: 6 });
});

test('logout and disconnect use separate server actions and clear browser session state only after success', async () => {
  const context = loadAppContext();
  const result = JSON.parse(await run(context, `(async () => {
    const calls=[]; const authErrors=[]; let invalidations=0;
    postAuthAction=async(path,body)=>{calls.push({path,body});return path===AUTH_LOGOUT_PATH
      ? {ok:true,payload:{loggedOut:true}}
      : {ok:true,payload:{disconnected:true,revocation:'inconclusive'}}};
    invalidateDriveSessionData=()=>{invalidations++};closePlayer=()=>{};showSetup=()=>{};showToast=()=>{};setAuthError=(message)=>authErrors.push(message);
    el.logoutButton={disabled:false};el.disconnectButton={disabled:false};el.settingsDialog={open:false};
    window.confirm=()=>true;
    state.authAccountKey='account-A';state.token='one';state.expiresAt=Date.now()+60_000;state.tokenRevision=5;
    await logout();
    const afterLogout={account:state.authAccountKey,token:state.token,revision:state.tokenRevision};
    state.authAccountKey='account-B';state.token='two';state.expiresAt=Date.now()+60_000;state.tokenRevision=9;
    await disconnect();
    return JSON.stringify({calls,invalidations,authErrors,afterLogout,afterDisconnect:{account:state.authAccountKey,token:state.token,revision:state.tokenRevision}});
  })()`));
  assert.deepEqual(result, {
    calls: [
      { path: '/api/session/logout' },
      { path: '/api/account/disconnect', body: { expectedAccount: 'account-B' } }
    ],
    invalidations: 2,
    authErrors: ['앱 세션은 삭제했지만 Google 권한 폐기는 확인되지 않았습니다. Google 계정의 연결된 앱에서 Drive Original 권한을 확인해 주세요.'],
    afterLogout: { account: null, token: null, revision: 0 },
    afterDisconnect: { account: null, token: null, revision: 0 }
  });
});

test('pagination exhausts tokens and rejects a repeated cursor', async () => {
  const context = loadAppContext();
  const collected = await run(context, `(async () => {
    const pages = new Map([
      ['', { items: [1, 2], nextPageToken: 'a' }],
      ['a', { items: [3], nextPageToken: 'b' }],
      ['b', { items: [4], nextPageToken: null }]
    ]);
    return collectAllPages((token) => Promise.resolve(pages.get(token || '')));
  })()`);
  assert.deepEqual(Array.from(collected.items), [1, 2, 3, 4]);

  await assert.rejects(
    run(context, `collectAllPages(() => Promise.resolve({ items: [], nextPageToken: 'same' }))`),
    /repeated page token/i
  );
});

test('render window is row-aligned and never exceeds the hard DOM cap', () => {
  const context = loadAppContext();
  const first = JSON.parse(run(context, 'JSON.stringify(computeRenderWindow(9788, 0, 5))'));
  assert.deepEqual(first, { start: 0, end: 240 });

  const middle = JSON.parse(run(context, 'JSON.stringify(computeRenderWindow(9788, 377, 5))'));
  assert.equal(middle.start % 5, 0);
  assert.ok(middle.end - middle.start <= 240);

  const tail = JSON.parse(run(context, 'JSON.stringify(computeRenderWindow(9788, 9700, 5))'));
  assert.equal(tail.end, 9788);
  assert.ok(tail.end - tail.start <= 240);
});

test('render scheduler repairs uncovered viewport rows and keeps covered scrolling inside hysteresis', () => {
  function probe({ start, scrollY, innerHeight = 900, total = 3000 }) {
    const context = loadAppContext();
    const { findNodes } = installMiniDom(context);
    const callbacks = [];
    context.requestAnimationFrame = callback => { callbacks.push(callback); return callbacks.length; };
    context.window.scrollY = scrollY;
    context.window.innerHeight = innerHeight;
    const grid = context.document.createElement('div');
    grid.clientWidth = 1030; // six columns under the app's fallback sizing rule
    grid.hidden = false;
    grid.renderCount = 0;
    grid.getBoundingClientRect = () => ({ top: 410 - context.window.scrollY });
    const replaceChildren = grid.replaceChildren.bind(grid);
    grid.replaceChildren = (...children) => { grid.renderCount += 1; replaceChildren(...children); };
    context.testGrid = grid;
    run(context, `(() => {
      el.fileGrid = testGrid;
      state.files = Array.from({length:${total}}, (_, index) => ({
        id: String(index), name: 'file-' + index, mimeType: 'image/jpeg'
      }));
      state.filter = 'all'; state.query = ''; state.sort = 'name';
      state.renderWindowStart = ${start}; state.renderRowHeight = 236.287;
      createFileCard = () => {
        const card = document.createElement('div');
        card.className = 'file-card';
        return card;
      };
      renderMediaGrid(state.files);
    })()`);
    const initialRenderCount = grid.renderCount;
    run(context, 'scheduleRenderWindowUpdate()');
    assert.equal(callbacks.length, 1, 'one scheduled frame should own the update');
    callbacks.shift()();
    const range = JSON.parse(run(context, `JSON.stringify(computeRenderWindow(
      state.files.length, state.renderWindowStart, state.renderColumnCount
    ))`));
    return {
      renderCount: grid.renderCount,
      initialRenderCount,
      start: range.start,
      end: range.end,
      mounted: findNodes(grid, '.file-card').length
    };
  }

  const staleTop = probe({ start: 36, scrollY: 0, innerHeight: 4500 });
  assert.equal(staleTop.renderCount, staleTop.initialRenderCount + 1,
    'a stale top window must repair even when the focus-derived start shift is below the old threshold');
  assert.equal(staleTop.start, 0, 'the new range must include the first viewport rows');
  assert.equal(staleTop.mounted, 240);

  const covered = probe({ start: 36, scrollY: 2200, innerHeight: 800 });
  assert.equal(covered.renderCount, covered.initialRenderCount,
    'small scrolls that remain covered must keep the existing window');
  assert.equal(covered.start, 36);
  assert.equal(covered.mounted, 240);

  const largeJump = probe({ start: 36, scrollY: 410 + 250 * 236.287, innerHeight: 900 });
  assert.equal(largeJump.renderCount, largeJump.initialRenderCount + 1,
    'a large jump into an uncovered middle range must render that range');
  assert.ok(largeJump.start <= 250 * 6 && largeJump.end > 250 * 6);
  assert.equal(largeJump.mounted, 240);

  const bottom = probe({ start: 36, scrollY: 410 + 497 * 236.287, innerHeight: 900 });
  assert.equal(bottom.renderCount, bottom.initialRenderCount + 1,
    'the last viewport rows must be included when returning near the end');
  assert.ok(bottom.start <= 497 * 6 && bottom.end === 3000);
  assert.equal(bottom.mounted, 240);
});

test('move rows include roots, descendants, orphans, and cycles exactly once', () => {
  const context = loadAppContext();
  const rows = JSON.parse(run(context, `JSON.stringify(buildMoveFolderRows({
    roots: [
      { id: 'my-root', name: '내 드라이브', driveId: null, capabilities: { canAddChildren: true } },
      { id: 'shared-root', name: '팀 드라이브', driveId: 'shared-root', capabilities: { canAddChildren: true } }
    ],
    folders: [
      { id: 'a', name: 'A', parents: ['my-root'] },
      { id: 'b', name: 'B', parents: ['a'] },
      { id: 'orphan', name: 'Orphan', parents: ['missing'] },
      { id: 'cycle-1', name: 'Cycle 1', parents: ['cycle-2'] },
      { id: 'cycle-2', name: 'Cycle 2', parents: ['cycle-1'] },
      { id: 'team-child', name: 'Team Child', parents: ['shared-root'], driveId: 'shared-root' }
    ]
  }))`));
  const ids = rows.map((row) => row.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(new Set(ids), new Set(['my-root', 'shared-root', 'a', 'b', 'orphan', 'cycle-1', 'cycle-2', 'team-child']));
  assert.ok(rows.find((row) => row.id === 'b').depth > rows.find((row) => row.id === 'a').depth);
});

test('breadcrumb items show the Drive root exactly once and remove stale duplicate entries', () => {
  const context = loadAppContext();
  const result = JSON.parse(run(context, `JSON.stringify({
    root: buildBreadcrumbItems([], 'root', '내 드라이브'),
    nested: buildBreadcrumbItems([
      { id: 'root', name: '내 드라이브' },
      { id: 'folder-a', name: 'A' },
      { id: 'folder-a', name: 'A duplicate' },
      { id: 'folder-b', name: 'B stale current' }
    ], 'folder-b', 'B')
  })`));
  assert.deepEqual(result.root, [{ id: 'root', name: '내 드라이브' }]);
  assert.deepEqual(result.nested, [
    { id: 'root', name: '내 드라이브' },
    { id: 'folder-a', name: 'A' },
    { id: 'folder-b', name: 'B' }
  ]);
});

test('random selection uses the complete population and avoids the current item', () => {
  const context = loadAppContext();
  const selected = JSON.parse(run(context, `JSON.stringify(pickRandomFile([
    { id: 'loaded-first' },
    { id: 'loaded-last' },
    { id: 'not-rendered' }
  ], 'loaded-first', () => 0.99))`));
  assert.equal(selected.id, 'not-rendered');
  assert.equal(run(context, "pickRandomFile([{ id: 'only' }], 'only', () => 0.5).id"), 'only');
});

test('account media state merges viewed history and honors the newest favorite toggle', () => {
  const context = loadAppContext();
  const merged = JSON.parse(run(context, `JSON.stringify(mergeAccountMediaStates(
    {
      updatedAt: 20,
      viewed: { a: 10, shared: 15 },
      favorites: { x: { liked: true, updatedAt: 10 }, y: { liked: true, updatedAt: 20 } }
    },
    {
      updatedAt: 30,
      viewed: { b: 30, shared: 25 },
      favorites: { x: { liked: false, updatedAt: 30 }, y: { liked: false, updatedAt: 5 } }
    }
  ))`));
  assert.deepEqual(merged.viewed, { a: 10, shared: 25, b: 30 });
  assert.deepEqual(merged.favorites.x, { liked: false, updatedAt: 30 });
  assert.deepEqual(merged.favorites.y, { liked: true, updatedAt: 20 });
});

test('shorts deck exhausts unseen account media before watched candidates', () => {
  const context = loadAppContext();
  const deck = JSON.parse(run(context, `JSON.stringify(buildVerticalPlaybackDeck(
    ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({ id })),
    'a',
    () => 0.999,
    2,
    new Set(['b', 'c'])
  ))`));
  assert.deepEqual([deck.below[0], deck.above[0], deck.below[1]], ['d', 'e', 'f']);
  assert.equal(deck.above[1], 'b');
});

test('double-tap reserves narrow lateral video edges for seek and the central zone for likes', () => {
  const context = loadAppContext();
  assert.equal(run(context, "resolveMediaDoubleTapAction(10, 0, 400, true, 'left')"), 'seek-backward');
  assert.equal(run(context, "resolveMediaDoubleTapAction(390, 0, 400, true, 'right')"), 'seek-forward');
  assert.equal(run(context, 'resolveMediaDoubleTapAction(120, 0, 400, true)'), 'favorite');
  assert.equal(run(context, "resolveMediaDoubleTapAction(10, 0, 400, false, 'left')"), null);
  assert.equal(run(context, "resolveMediaDoubleTapAction(200, 0, 400, true, 'top')"), null);
});

test('mobile tap pairs toggle favorites once per pair and consume the gesture', () => {
  const context = loadAppContext();
  const result = JSON.parse(run(context, `(() => {
    let clock = 1000;
    let toggles = 0;
    let feedback = false;
    Date.now = () => clock;
    navigator.vibrate = () => {};
    el.mediaStage = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 800 }) };
    el.videoPlayer = { hidden: true };
    toggleFavoriteForSelected = (options) => {
      toggles += 1;
      feedback = feedback || Boolean(options?.showFeedback);
      return toggles % 2 === 1;
    };
    handleStageTap(200, 400);
    clock += 100;
    handleStageTap(200, 400);
    clock += 400;
    handleStageTap(200, 400);
    clock += 100;
    handleStageTap(200, 400);
    return JSON.stringify({ toggles, feedback, pendingSingleTap: Boolean(singleTapTimer), lastTapTime });
  })()`));
  assert.deepEqual(result, { toggles: 2, feedback: true, pendingSingleTap: false, lastTapTime: 0 });
});

test('mobile library edge swipe tracks from the left edge and commits one back navigation', () => {
  const context = loadAppContext();
  const result = JSON.parse(run(context, `(() => {
    const listeners = {};
    let navigations = 0;
    let prevented = 0;
    document.addEventListener = (type, listener) => { listeners[type] = listener; };
    document.querySelector = () => null;
    isMobileDevice = () => true;
    navigateToParentFolder = () => { navigations += 1; };
    el.playerSheet = { hidden: true };
    el.libraryView = { hidden: false, style: {}, clientWidth: 390 };
    el.edgeBackIndicator = { hidden: true, style: {} };
    state.currentFolderId = 'folder-a';
    state.folderStack = [{ id: 'root', name: '내 드라이브' }];
    state.filter = 'all';
    setupLibraryEdgeBackGesture();
    const target = { closest: () => null };
    listeners.touchstart({ touches: [{ clientX: 4, clientY: 420 }], target });
    listeners.touchmove({
      touches: [{ clientX: 122, clientY: 424 }],
      preventDefault() { prevented += 1; }
    });
    listeners.touchend({ changedTouches: [{ clientX: 168, clientY: 425 }] });
    return JSON.stringify({
      navigations,
      prevented,
      indicatorHidden: el.edgeBackIndicator.hidden,
      transform: el.libraryView.style.transform || ''
    });
  })()`));
  assert.deepEqual(result, { navigations: 1, prevented: 1, indicatorHidden: true, transform: '' });
});

test('account state upload creates a private appDataFolder JSON file', async () => {
  const context = loadAppContext();
  const result = JSON.parse(await run(context, `(async () => {
    let captured = null;
    let stored = null;
    state.accountId = 'account-a'; state.accountStateWriterId = 'fixture-writer';
    state.accountStateLoaded = true; state.accountIdentityPending = false;
    driveFetch = async (url, options) => {
      if (url.includes('/generateIds?')) return { json: async () => ({ ids: ['state-file'], space: 'appDataFolder' }) };
      if (options?.method === 'POST') {
        captured = { url, options };
        stored = JSON.parse(options.body.split('\\r\\n\\r\\n').slice(2)[0].split('\\r\\n--')[0]);
        return { body: { cancel: async () => {} } };
      }
      if (url.includes('alt=media')) return { json: async () => stored };
      return { json: async () => ({ id: 'state-file', name: accountStateWriterFileName(), modifiedTime: 'confirmed', trashed: false, spaces: ['appDataFolder'] }) };
    };
    const created = await createAccountStateFile({
      viewed: { watched: 12 },
      favorites: { liked: { liked: true, updatedAt: 20 } },
      updatedAt: 20
    });
    return JSON.stringify({
      created,
      url: captured.url,
      method: captured.options.method,
      contentType: captured.options.headers['Content-Type'],
      hasAppDataParent: captured.options.body.includes('"parents":["appDataFolder"]'),
      hasFavorite: captured.options.body.includes('"liked":true')
    });
  })()`));
  assert.match(result.contentType, /^multipart\/related; boundary=drive_original_/);
  assert.deepEqual({ ...result, contentType: 'multipart' }, {
    created: { id: 'state-file', modifiedTime: 'confirmed' },
    url: 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,modifiedTime',
    method: 'POST',
    contentType: 'multipart',
    hasAppDataParent: true,
    hasFavorite: true
  });
});

test('account initialization merges a newer offline cache and schedules it back to Drive', async () => {
  const cached = JSON.stringify({
    schemaVersion: 1,
    updatedAt: 30,
    viewed: { localWatch: 25 },
    favorites: { shared: { liked: true, updatedAt: 30 } }
  });
  const context = loadAppContext({ 'drive-original.account-state.account-a': cached });
  const result = JSON.parse(await run(context, `(async () => {
    state.token = 'token';
    state.expiresAt = Date.now() + 60_000;
    let queued = 0;
    resolveDriveAccountId = async () => 'account-a';
    findAccountStateFile = async () => ({ id: 'remote-state' });
    readAccountStateFile = async () => ({
      schemaVersion: 1,
      updatedAt: 20,
      viewed: { remoteWatch: 20 },
      favorites: { shared: { liked: false, updatedAt: 10 } }
    });
    queueAccountStateSync = () => { queued += 1; };
    await initializeAccountMediaState();
    return JSON.stringify({
      queued,
      viewed: state.accountMediaState.viewed,
      favorite: state.accountMediaState.favorites.shared
    });
  })()`));
  assert.deepEqual(result, {
    queued: 1,
    viewed: { remoteWatch: 20, localWatch: 25 },
    favorite: { liked: true, updatedAt: 30 }
  });
});

test('favorite catalog view spans folders and excludes folders and non-media records', () => {
  const context = loadAppContext();
  const ids = JSON.parse(run(context, `(() => {
    const catalog = buildTreeIndexes([
      { id: 'folder-a', name: 'A', mimeType: FOLDER_MIME, parents: ['root'] },
      { id: 'video-a', name: 'A.mp4', mimeType: 'video/mp4', parents: ['folder-a'] },
      { id: 'image-root', name: 'root.jpg', mimeType: 'image/jpeg', parents: ['root'] },
      { id: 'doc', name: 'doc.pdf', mimeType: 'application/pdf', parents: ['root'] }
    ]);
    return JSON.stringify(collectFavoriteMediaFromCatalog(catalog, new Set(['folder-a', 'video-a', 'image-root', 'doc']))
      .map((file) => ({ id: file.id, origin: file.__origin })));
  })()`));
  assert.deepEqual(ids, [
    { id: 'video-a', origin: 'A' },
    { id: 'image-root', origin: '내 드라이브' }
  ]);
});

test('favorite resolution reuses known media and identifies only unresolved file IDs', () => {
  const context = loadAppContext();
  const result = JSON.parse(run(context, `(() => {
    const catalog = buildTreeIndexes([
      { id: 'folder-a', name: 'A', mimeType: FOLDER_MIME, parents: ['root'] },
      { id: 'known-tree', name: 'tree.mp4', mimeType: 'video/mp4', parents: ['folder-a'] }
    ]);
    const resolved = collectKnownFavoriteMedia([
      catalog.items,
      [{ id: 'known-current', name: 'current.jpg', mimeType: 'image/jpeg', parents: ['root'] }],
      [{ id: 'ignored-document', name: 'notes.pdf', mimeType: 'application/pdf', parents: ['root'] }]
    ], new Set(['known-tree', 'known-current', 'missing', 'ignored-document']), catalog, 'root');
    return JSON.stringify({
      files: resolved.files.map((file) => ({ id: file.id, origin: file.__origin })),
      missingIds: resolved.missingIds
    });
  })()`));
  assert.deepEqual(result, {
    files: [
      { id: 'known-tree', origin: 'A' },
      { id: 'known-current', origin: '내 드라이브' }
    ],
    missingIds: ['missing', 'ignored-document']
  });
});

test('favorite view keeps cached matches and fetches missing liked files when account refresh fails', async () => {
  const context = loadAppContext();
  context.console = { error() {}, log() {}, warn() {} };
  const result = JSON.parse(await run(context, `(async () => {
    const requested = [];
    let renders = 0;
    renderFiles = () => { renders += 1; };
    el.libraryStatus = { textContent: '' };
    initializeAccountMediaState = async () => {
      const error = new Error('missing app data permission');
      error.status = 403;
      error.reasons = ['insufficientPermissions'];
      throw error;
    };
    driveFetch = async (url, options) => {
      requested.push({ url, aborted: options.signal.aborted });
      return {
        json: async () => ({
          id: 'remote-liked', name: 'remote.mp4', mimeType: 'video/mp4', parents: ['remote-folder']
        })
      };
    };
    state.filter = 'favorites';
    state.rootFolderId = 'root';
    state.treeCache = buildTreeIndexes([
      { id: 'remote-folder', name: '원격', mimeType: FOLDER_MIME, parents: ['root'] }
    ]);
    state.accountMediaState = {
      schemaVersion: 1,
      updatedAt: 20,
      viewed: {},
      favorites: {
        'cached-liked': { liked: true, updatedAt: 10 },
        'remote-liked': { liked: true, updatedAt: 20 }
      }
    };
    state.files = [
      { id: 'cached-liked', name: 'cached.jpg', mimeType: 'image/jpeg', parents: ['root'] }
    ];
    await loadFavoriteFiles();
    return JSON.stringify({
      ids: state.favoriteFiles.map((file) => file.id),
      origins: state.favoriteFiles.map((file) => file.__origin),
      requested,
      status: el.libraryStatus.textContent,
      loading: state.loadingFavorites,
      renders
    });
  })()`));
  assert.deepEqual(result.ids, ['cached-liked', 'remote-liked']);
  assert.deepEqual(result.origins, ['내 드라이브', '원격']);
  assert.equal(result.requested.length, 1);
  assert.match(result.requested[0].url, /\/files\/remote-liked\?/);
  assert.equal(result.requested[0].aborted, false);
  assert.match(result.status, /이 기기에 저장된 좋아요/);
  assert.equal(result.loading, false);
  assert.equal(result.renders, 2);
});

test('library status ownership prevents a late request from reviving stale text', () => {
  const context = loadAppContext();
  const result = JSON.parse(run(context, `(() => {
    el.libraryStatus = { textContent: '' };
    const oldRequest = beginLibraryStatus('오래된 요청');
    const currentRequest = beginLibraryStatus('현재 요청');
    const oldAccepted = updateLibraryStatus(oldRequest, '뒤늦은 오류');
    const afterLateUpdate = el.libraryStatus.textContent;
    clearLibraryStatus();
    const currentAcceptedAfterClear = updateLibraryStatus(currentRequest, '다시 나타난 오류');
    return JSON.stringify({ oldAccepted, afterLateUpdate, currentAcceptedAfterClear, finalText: el.libraryStatus.textContent });
  })()`));
  assert.deepEqual(result, {
    oldAccepted: false,
    afterLateUpdate: '현재 요청',
    currentAcceptedAfterClear: false,
    finalText: ''
  });
});

test('non-video media immediately hides stale video playback controls', () => {
  const context = loadAppContext();
  const result = JSON.parse(run(context, `(() => {
    el.videoPlayer = { hidden: true };
    el.customVideoControls = { hidden: false };
    el.stageCenterPlayBtn = { hidden: false };
    el.ctrlFramePrev = { hidden: false };
    el.ctrlFrameNext = { hidden: false };
    el.shortsFramePrev = { hidden: false };
    el.shortsFrameNext = { hidden: false };
    updatePlayPauseUI();
    return JSON.stringify({ controls: el.customVideoControls.hidden, center: el.stageCenterPlayBtn.hidden });
  })()`));
  assert.deepEqual(result, { controls: true, center: true });
});

test('vertical shorts deck preassigns two items above and below and reverses spatially', () => {
  const context = loadAppContext();
  const result = JSON.parse(run(context, `(() => {
    const files = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({ id }));
    const initial = buildVerticalPlaybackDeck(files, 'a', () => 0.999);
    const movedUp = advanceVerticalPlaybackDeck(initial, 'up', initial.below[0], files, () => 0.999);
    const returned = advanceVerticalPlaybackDeck(movedUp, 'down', movedUp.above[0], files, () => 0.999);
    const tinyFiles = [{ id: 'a' }, { id: 'b' }];
    const tinyInitial = buildVerticalPlaybackDeck(tinyFiles, 'a', () => 0.999);
    const tinyMoved = advanceVerticalPlaybackDeck(tinyInitial, 'up', tinyInitial.below[0], tinyFiles, () => 0.999);
    return JSON.stringify({ initial, movedUp, returned, tinyMoved });
  })()`));
  assert.equal(result.initial.above.length, 2);
  assert.equal(result.initial.below.length, 2);
  assert.equal(new Set(['a', ...result.initial.above, ...result.initial.below]).size, 5);
  assert.equal(result.movedUp.above[0], 'a');
  assert.equal(result.returned.anchorId, 'a');
  assert.equal(result.returned.below[0], result.movedUp.anchorId);
  assert.equal(result.tinyMoved.above.length, 2);
  assert.equal(result.tinyMoved.below.length, 2);
  assert.deepEqual(new Set([...result.tinyMoved.above, ...result.tinyMoved.below]), new Set(['a']));
});

test('later metadata pages extend the frozen horizontal order without reshuffling it', () => {
  const context = loadAppContext();
  const order = JSON.parse(run(context, `(() => {
    state.playbackOrderIds = ['a', 'b'];
    extendPlaybackOrder([{ id: 'b' }, { id: 'c' }, { id: 'd' }]);
    return JSON.stringify(state.playbackOrderIds);
  })()`));
  assert.deepEqual(order, ['a', 'b', 'c', 'd']);
});

test('original buffer policy prefers bounded OPFS and denies unsafe memory downloads', () => {
  const context = loadAppContext();
  const policies = JSON.parse(run(context, `JSON.stringify({
    diskAuto: getOriginalBufferPolicy({ size: 32 * 1024 * 1024, mobile: true, opfsAvailable: true, storageAvailable: 1024 * 1024 * 1024 }),
    diskConfirm: getOriginalBufferPolicy({ size: 256 * 1024 * 1024, mobile: true, opfsAvailable: true, storageAvailable: 1024 * 1024 * 1024 }),
    memoryAuto: getOriginalBufferPolicy({ size: 16 * 1024 * 1024, mobile: true, opfsAvailable: false }),
    memoryDenied: getOriginalBufferPolicy({ size: 128 * 1024 * 1024, mobile: true, opfsAvailable: false })
  })`));
  assert.deepEqual([policies.diskAuto.mode, policies.diskAuto.decision], ['disk', 'auto']);
  assert.deepEqual([policies.diskConfirm.mode, policies.diskConfirm.decision], ['disk', 'confirm']);
  assert.deepEqual([policies.memoryAuto.mode, policies.memoryAuto.decision], ['memory', 'auto']);
  assert.equal(policies.memoryDenied.decision, 'denied');
});

test('QA-TR-11 local storage limits stay explicit and never auto-select compatibility', async () => {
  const context = loadAppContext();
  context.console = { error() {}, warn() {}, log() {} };
  const result = JSON.parse(await run(context, `(async () => {
    const errors = [];
    const previews = [];
    const file = {
      id: 'storage-limited', name: 'storage-limited.jpg', mimeType: 'image/jpeg',
      size: String(300 * 1024 * 1024)
    };
    let policyChecks = 0;
    showMediaError = (message, options = {}) => errors.push({ message, options });
    showDrivePreview = (_file, reason) => previews.push(reason);
    updateQualityDisplay = () => {};
    clearDirectMediaSources = () => {};
    showMediaLoading = () => {};
    cleanupOriginalTempStorage = () => {};
    el.compatPlayerButton = { hidden: true };
    el.bufferOriginalButton = { hidden: true, textContent: '' };
    el.codecNote = { textContent: '' };
    el.mediaLoading = { hidden: true };
    el.mediaLoadingText = { textContent: '' };
    state.selected = file;
    state.mediaSession = 41;
    state.mediaAttempt = 'range';
    state.mediaPlaybackMode = PLAYBACK_MODE.RANGE;
    supportsWritableOpfs = async () => { policyChecks += 1; return false; };
    const storageFailure = {
      type: 'MEDIA_PROXY_ERROR', fileId: file.id, sessionId: '41',
      sourceGeneration: mediaSourceGeneration, status: 504,
      category: 'timeout', driveReason: 'bodyNoProgress'
    };
    await handleWorkerMessage({ data: storageFailure });
    await handleWorkerMessage({ data: storageFailure });
    const unavailable = {
      attempt: state.mediaAttempt,
      playbackMode: state.mediaPlaybackMode,
      previewCount: previews.length,
      errorCount: errors.length,
      policyChecks,
      error: errors.at(-1),
      compatVisible: el.compatPlayerButton.hidden === false,
      codecNote: el.codecNote.textContent
    };

    errors.length = 0;
    previews.length = 0;
    el.compatPlayerButton.hidden = true;
    state.mediaSession = 42;
    state.mediaAttempt = 'buffer-evaluating';
    state.mediaPlaybackMode = PLAYBACK_MODE.RANGE;
    downloadOriginalFile = async () => {
      throw new DOMException('quota full', 'QuotaExceededError');
    };
    getOriginalBufferPolicy = () => ({
      decision: 'denied', mode: 'memory', hardLimit: DESKTOP_MEMORY_BUFFER_HARD_LIMIT
    });
    await startOriginalBlobFallback(file, 'image', 42, {
      confirmed: true,
      policy: { decision: 'auto', mode: 'disk', hardLimit: 1024 * 1024 * 1024 }
    });
    const quota = {
      attempt: state.mediaAttempt,
      playbackMode: state.mediaPlaybackMode,
      previewCount: previews.length,
      error: errors.at(-1),
      compatVisible: el.compatPlayerButton.hidden === false,
      codecNote: el.codecNote.textContent
    };
    return JSON.stringify({
      unavailable,
      quota,
      memoryLimitClassified: isLocalOriginalStorageError(
        new RangeError('Original file exceeds the memory buffer limit')
      )
    });
  })()`));

  for (const branch of [result.unavailable, result.quota]) {
    assert.equal(branch.attempt, 'buffer-storage-limited');
    assert.equal(branch.playbackMode, '');
    assert.equal(branch.previewCount, 0);
    assert.equal(branch.error.options.title, '기기 저장공간 한도');
    assert.match(branch.error.message, /저장공간|메모리/);
    assert.equal(branch.compatVisible, true);
    assert.match(branch.codecNote, /형식.*판정하지 않았/);
  }
  assert.equal(result.unavailable.errorCount, 1);
  assert.equal(result.unavailable.policyChecks, 1);
  assert.equal(result.memoryLimitClassified, true);
});

test('QA-TR-11 a native memory Blob allocation failure stays storage-limited', async () => {
  const context = loadAppContext();
  context.console = { error() {}, warn() {}, log() {} };
  const result = JSON.parse(await run(context, `(async () => {
    const file = {
      id: 'blob-allocation', name: 'blob-allocation.jpg', mimeType: 'image/jpeg', size: '2'
    };
    const errors = [];
    const previews = [];
    let reads = 0;
    let released = 0;
    let readerCancelled = 0;
    let bodyCancelled = 0;
    const NativeBlob = Blob;
    Blob = class {
      constructor() { throw new RangeError('Native Blob allocation failed'); }
    };
    fetchOriginalFileResponse = async () => ({
      status: 200,
      headers: new Headers({ 'Content-Length': '2', 'Content-Type': 'image/jpeg' }),
      body: {
        getReader: () => ({
          async read() {
            reads += 1;
            return reads === 1
              ? { done: false, value: new Uint8Array([1, 2]) }
              : { done: true };
          },
          async cancel() { readerCancelled += 1; },
          releaseLock() { released += 1; }
        }),
        async cancel() { bodyCancelled += 1; }
      }
    });
    updateOriginalBufferProgress = () => {};
    updateQualityDisplay = () => {};
    showMediaLoading = () => {};
    showMediaError = (message, options = {}) => errors.push({ message, options });
    showDrivePreview = (_file, reason) => previews.push(reason);
    el.videoPlayer = {
      hidden: false, dataset: { mediaSession: '43' },
      pause() {}, removeAttribute() {}, load() {}, classList: { remove() {} }
    };
    el.imageViewer = {
      hidden: false, dataset: { mediaSession: '43' }, alt: 'old',
      removeAttribute() {}, classList: { remove() {} }
    };
    el.compatPlayerButton = { hidden: true };
    el.bufferOriginalButton = { hidden: true, textContent: '' };
    el.codecNote = { textContent: '' };
    state.selected = file;
    state.mediaSession = 43;
    state.mediaFullRequestCount = 0;
    state.mediaAttempt = 'buffer-evaluating';
    state.mediaPlaybackMode = PLAYBACK_MODE.RANGE;
    try {
      await startOriginalBlobFallback(file, 'image', 43, {
        confirmed: true,
        policy: { decision: 'auto', mode: 'memory', hardLimit: DESKTOP_MEMORY_BUFFER_HARD_LIMIT }
      });
    } finally {
      Blob = NativeBlob;
    }
    return JSON.stringify({
      reads,
      released,
      readerCancelled,
      bodyCancelled,
      attempt: state.mediaAttempt,
      playbackMode: state.mediaPlaybackMode,
      previewCount: previews.length,
      error: errors.at(-1),
      compatVisible: el.compatPlayerButton.hidden === false,
      codecNote: el.codecNote.textContent,
      abortOwner: Boolean(state.mediaAbortController)
    });
  })()`));

  assert.equal(result.reads, 2);
  assert.equal(result.released, 1);
  assert.equal(result.readerCancelled, 1);
  assert.equal(result.bodyCancelled, 1);
  assert.equal(result.attempt, 'buffer-storage-limited');
  assert.equal(result.playbackMode, '');
  assert.equal(result.previewCount, 0);
  assert.equal(result.error.options.title, '기기 저장공간 한도');
  assert.equal(result.compatVisible, true);
  assert.match(result.codecNote, /형식.*판정하지 않았/);
  assert.equal(result.abortOwner, false);
});

test('QA-TR-11 mid-write OPFS quota cleans its lease and ends as storage-limited', async () => {
  const context = loadAppContext();
  context.console = { error() {}, warn() {}, log() {} };
  const result = JSON.parse(await run(context, `(async () => {
    const file = {
      id: 'quota-partial', name: 'quota-partial.mp4', mimeType: 'video/mp4',
      size: String(300 * 1024 * 1024)
    };
    const removed = [];
    const lockNames = [];
    const errors = [];
    const previews = [];
    let requests = 0;
    let writes = 0;
    let readerCancelled = 0;
    let readerReleased = 0;
    let writableAborted = 0;
    let leaseSettled = 0;
    const reader = {
      index: 0,
      async read() {
        this.index += 1;
        if (this.index === 1) return { done: false, value: new Uint8Array([1, 2]) };
        if (this.index === 2) return { done: false, value: new Uint8Array([3, 4]) };
        return { done: true };
      },
      async cancel() { readerCancelled += 1; },
      releaseLock() { readerReleased += 1; }
    };
    const writable = {
      async write() {
        writes += 1;
        if (writes === 2) throw new DOMException('quota full', 'QuotaExceededError');
      },
      async close() {},
      async abort() { writableAborted += 1; }
    };
    const directory = {
      async getFileHandle() {
        return { createWritable: async () => writable, getFile: async () => new Blob(['bad']) };
      },
      async removeEntry(name) { removed.push(name); }
    };
    navigator.storage = {
      getDirectory: async () => ({ getDirectoryHandle: async () => directory })
    };
    navigator.locks = {
      request(name, optionsOrCallback, maybeCallback) {
        lockNames.push(name);
        const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback;
        const lifetime = Promise.resolve().then(() => callback({ name }));
        lifetime.then(() => { leaseSettled += 1; });
        return lifetime;
      }
    };
    fetchOriginalFileResponse = async () => {
      requests += 1;
      return {
        status: 200,
        headers: new Headers({ 'Content-Length': file.size }),
        body: { getReader: () => reader, cancel: async () => {} }
      };
    };
    updateOriginalBufferProgress = () => {};
    updateQualityDisplay = () => {};
    showMediaLoading = () => {};
    showMediaError = (message, options = {}) => errors.push({ message, options });
    showDrivePreview = (_file, reason) => previews.push(reason);
    el.videoPlayer = {
      hidden: false, dataset: { mediaSession: '51' },
      pause() {}, removeAttribute() {}, load() {}, classList: { remove() {} }
    };
    el.imageViewer = {
      hidden: false, dataset: { mediaSession: '51' }, alt: 'old',
      removeAttribute() {}, classList: { remove() {} }
    };
    el.compatPlayerButton = { hidden: true };
    el.bufferOriginalButton = { hidden: true, textContent: '' };
    el.codecNote = { textContent: '' };
    state.selected = file;
    state.mediaSession = 51;
    state.mediaFullRequestCount = 0;
    state.mediaAttempt = 'buffer-evaluating';
    state.mediaPlaybackMode = PLAYBACK_MODE.RANGE;
    const sourceGenerationBefore = mediaSourceGeneration;
    await startOriginalBlobFallback(file, 'image', 51, {
      confirmed: true,
      policy: { decision: 'auto', mode: 'disk', hardLimit: 1024 * 1024 * 1024 }
    });
    await Promise.resolve();
    await Promise.resolve();
    return JSON.stringify({
      requests, writes, readerCancelled, readerReleased, writableAborted,
      removed: removed.length, lockNames: lockNames.length, leaseSettled,
      tempStorage: Boolean(state.mediaTempStorage),
      attempt: state.mediaAttempt,
      playbackMode: state.mediaPlaybackMode,
      exhaustedDisk: state.mediaExhaustedOriginalModes.has(PLAYBACK_MODE.OPFS),
      fullRequestCount: state.mediaFullRequestCount,
      previewCount: previews.length,
      error: errors.at(-1),
      compatVisible: el.compatPlayerButton.hidden === false,
      codecNote: el.codecNote.textContent,
      abortOwner: Boolean(state.mediaAbortController),
      sourceGenerationDelta: mediaSourceGeneration - sourceGenerationBefore,
      playerHidden: el.videoPlayer.hidden,
      imageHidden: el.imageViewer.hidden
    });
  })()`));

  assert.deepEqual({
    requests: result.requests,
    writes: result.writes,
    readerCancelled: result.readerCancelled,
    readerReleased: result.readerReleased,
    writableAborted: result.writableAborted,
    removed: result.removed,
    lockNames: result.lockNames,
    leaseSettled: result.leaseSettled,
    tempStorage: result.tempStorage,
    fullRequestCount: result.fullRequestCount,
    previewCount: result.previewCount,
    abortOwner: result.abortOwner,
    sourceGenerationDelta: result.sourceGenerationDelta,
    playerHidden: result.playerHidden,
    imageHidden: result.imageHidden
  }, {
    requests: 1,
    writes: 2,
    readerCancelled: 1,
    readerReleased: 1,
    writableAborted: 1,
    removed: 1,
    lockNames: 1,
    leaseSettled: 1,
    tempStorage: false,
    fullRequestCount: 1,
    previewCount: 0,
    abortOwner: false,
    sourceGenerationDelta: 2,
    playerHidden: true,
    imageHidden: true
  });
  assert.equal(result.attempt, 'buffer-storage-limited');
  assert.equal(result.playbackMode, '');
  assert.equal(result.exhaustedDisk, true);
  assert.equal(result.error.options.title, '기기 저장공간 한도');
  assert.match(result.error.message, /저장공간|메모리/);
  assert.equal(result.compatVisible, true);
  assert.match(result.codecNote, /형식.*판정하지 않았/);
});

test('QA-TR-11 a superseded buffer failure cannot replace the newer source', async () => {
  const context = loadAppContext();
  context.console = { error() {}, warn() {}, log() {} };
  const result = JSON.parse(await run(context, `(async () => {
    const file = {
      id: 'quota-superseded', name: 'quota-superseded.jpg', mimeType: 'image/jpeg',
      size: String(300 * 1024 * 1024)
    };
    const errors = [];
    const previews = [];
    let rejectDownload;
    let ownedGeneration = null;
    updateQualityDisplay = () => {};
    showMediaLoading = () => {};
    showMediaError = (message, options = {}) => errors.push({ message, options });
    showDrivePreview = (_file, reason) => previews.push(reason);
    downloadOriginalFile = (_file, _session, _policy, _signal, sourceGeneration) => {
      ownedGeneration = sourceGeneration;
      return new Promise((_resolve, reject) => { rejectDownload = reject; });
    };
    el.videoPlayer = {
      hidden: false, dataset: { mediaSession: '61' },
      pause() {}, removeAttribute() {}, load() {}, classList: { remove() {} }
    };
    el.imageViewer = {
      hidden: false, dataset: { mediaSession: '61' }, alt: 'old', src: '',
      removeAttribute(name) { if (name === 'src') this.src = ''; }, classList: { remove() {} }
    };
    el.compatPlayerButton = { hidden: true };
    el.bufferOriginalButton = { hidden: true, textContent: '' };
    el.codecNote = { textContent: '' };
    el.mediaLoading = { hidden: true };
    el.mediaLoadingText = { textContent: '' };
    window.setTimeout = (callback, delay) => delay === 5000 ? 0 : setTimeout(callback, delay);
    state.selected = file;
    state.mediaSession = 61;
    state.mediaAttempt = 'buffer-evaluating';
    state.mediaPlaybackMode = PLAYBACK_MODE.RANGE;
    const generationBefore = mediaSourceGeneration;
    const stale = startOriginalBlobFallback(file, 'image', 61, {
      confirmed: true,
      policy: { decision: 'auto', mode: 'disk', hardLimit: 1024 * 1024 * 1024 }
    });
    await Promise.resolve();
    const replacementStarted = startOriginalRangePlayback(file, 'image', 61, '새 원본 source 연결 중');
    const replacementGeneration = mediaSourceGeneration;
    rejectDownload(new DOMException('quota full', 'QuotaExceededError'));
    await stale;
    return JSON.stringify({
      replacementStarted,
      generationBefore,
      ownedGeneration,
      replacementGeneration,
      finalGeneration: mediaSourceGeneration,
      attempt: state.mediaAttempt,
      playbackMode: state.mediaPlaybackMode,
      imageSrc: el.imageViewer.src,
      imageSession: el.imageViewer.dataset.mediaSession,
      previewCount: previews.length,
      errorCount: errors.length,
      compatVisible: el.compatPlayerButton.hidden === false,
      abortOwner: Boolean(state.mediaAbortController)
    });
  })()`));

  assert.equal(result.replacementStarted, true);
  assert.equal(result.ownedGeneration, result.generationBefore + 1);
  assert.equal(result.replacementGeneration, result.generationBefore + 2);
  assert.equal(result.finalGeneration, result.replacementGeneration);
  assert.equal(result.attempt, 'range');
  assert.equal(result.playbackMode, 'original-range');
  assert.match(result.imageSrc, /__drive_media\/quota-superseded/);
  assert.match(result.imageSrc, new RegExp(`sourceGeneration=${result.replacementGeneration}`));
  assert.equal(result.imageSession, '61');
  assert.equal(result.previewCount, 0);
  assert.equal(result.errorCount, 0);
  assert.equal(result.compatVisible, false);
  assert.equal(result.abortOwner, false);
});

test('QA-TR-11 a superseded storage-policy result cannot replace the newer source', async () => {
  const context = loadAppContext();
  context.console = { error() {}, warn() {}, log() {} };
  const result = JSON.parse(await run(context, `(async () => {
    const file = {
      id: 'policy-superseded', name: 'policy-superseded.jpg', mimeType: 'image/jpeg',
      size: String(300 * 1024 * 1024)
    };
    const errors = [];
    const previews = [];
    let settlePolicy;
    resolveOriginalBufferPolicy = () => new Promise((resolve) => { settlePolicy = resolve; });
    updateQualityDisplay = () => {};
    showMediaLoading = () => {};
    showMediaError = (message, options = {}) => errors.push({ message, options });
    showDrivePreview = (_file, reason) => previews.push(reason);
    el.videoPlayer = {
      hidden: false, dataset: { mediaSession: '62' },
      pause() {}, removeAttribute() {}, load() {}, classList: { remove() {} }
    };
    el.imageViewer = {
      hidden: false, dataset: { mediaSession: '62' }, alt: 'old', src: '',
      removeAttribute(name) { if (name === 'src') this.src = ''; }, classList: { remove() {} }
    };
    el.compatPlayerButton = { hidden: true };
    el.bufferOriginalButton = { hidden: true, textContent: '' };
    el.codecNote = { textContent: '' };
    el.mediaLoading = { hidden: true };
    el.mediaLoadingText = { textContent: '' };
    window.setTimeout = (callback, delay) => delay === 5000 ? 0 : setTimeout(callback, delay);
    state.selected = file;
    state.mediaSession = 62;
    state.mediaAttempt = 'buffer-evaluating';
    state.mediaPlaybackMode = PLAYBACK_MODE.RANGE;
    const stale = offerOriginalBufferFallback(
      file,
      'image',
      62,
      '원본 구간 스트림을 안정적으로 이어가지 못해'
    );
    await Promise.resolve();
    const replacementStarted = startOriginalRangePlayback(file, 'image', 62, '새 원본 source 연결 중');
    const replacementGeneration = mediaSourceGeneration;
    settlePolicy({ decision: 'denied', mode: 'memory', hardLimit: DESKTOP_MEMORY_BUFFER_HARD_LIMIT });
    await stale;
    return JSON.stringify({
      replacementStarted,
      replacementGeneration,
      finalGeneration: mediaSourceGeneration,
      attempt: state.mediaAttempt,
      playbackMode: state.mediaPlaybackMode,
      imageSrc: el.imageViewer.src,
      previewCount: previews.length,
      errorCount: errors.length,
      compatVisible: el.compatPlayerButton.hidden === false
    });
  })()`));

  assert.equal(result.replacementStarted, true);
  assert.equal(result.finalGeneration, result.replacementGeneration);
  assert.equal(result.attempt, 'range');
  assert.equal(result.playbackMode, 'original-range');
  assert.match(result.imageSrc, /__drive_media\/policy-superseded/);
  assert.match(result.imageSrc, new RegExp(`sourceGeneration=${result.replacementGeneration}`));
  assert.equal(result.previewCount, 0);
  assert.equal(result.errorCount, 0);
  assert.equal(result.compatVisible, false);
});

test('known-clean initial Q0 assigns its source synchronously without storage policy or full download', () => {
  const context = loadAppContext();
  const calls = JSON.parse(run(context, `(() => {
    const calls = [];
    const file = { id: 'video', mimeType: 'video/mp4', size: String(32 * 1024 * 1024) };
    state.selected = file;
    state.mediaSession = 17;
    resolveOriginalBufferPolicy = async () => {
      calls.push('storage-policy');
      return { decision: 'auto', mode: 'disk' };
    };
    startOriginalBlobFallback = async () => { calls.push('full-download'); };
    startOriginalRangePlayback = (selected, kind, session) => {
      calls.push('range:' + selected.id + ':' + kind + ':' + session);
      return true;
    };
    startInitialOriginalPlayback(file, 'video', 17);
    return JSON.stringify(calls);
  })()`));
  assert.deepEqual(calls, ['range:video:video:17']);
});

test('an exhausted temporary-disk route is not selected again after Range fallback', async () => {
  const context = loadAppContext();
  const result = await run(context, `(async () => {
    navigator.storage = {
      getDirectory: async () => ({}),
      estimate: async () => ({ quota: 1024 * 1024 * 1024, usage: 0 })
    };
    supportsWritableOpfs = async () => true;
    state.mediaExhaustedOriginalModes.add(PLAYBACK_MODE.OPFS);
    return JSON.stringify(await resolveOriginalBufferPolicy({ size: String(32 * 1024 * 1024) }));
  })()`);
  assert.deepEqual(JSON.parse(result), {
    decision: 'auto',
    mode: 'memory',
    hardLimit: 256 * 1024 * 1024
  });
});

test('shorts playback order ignores search and media filter subsets', () => {
  const context = loadAppContext();
  const ids = JSON.parse(run(context, `(() => {
    state.files = [
      { id: 'video', name: 'Z clip', mimeType: 'video/mp4' },
      { id: 'image', name: 'A photo', mimeType: 'image/jpeg' },
      { id: 'hidden', name: 'M archive', mimeType: 'image/png' }
    ];
    state.filter = 'video';
    state.query = 'clip';
    state.sort = 'name';
    return JSON.stringify(getPlaybackFileList().map((file) => file.id));
  })()`));
  assert.deepEqual(ids, ['image', 'hidden', 'video']);
});

test('move capability checks distinguish shared-drive exits from My Drive entries', () => {
  const context = loadAppContext();
  assert.equal(run(context, `getMoveBlockReason(
    { driveId: 'shared-a', capabilities: { canMoveItemOutOfDrive: false } },
    { id: 'my-root', driveId: null, capabilities: { canAddChildren: true } },
    []
  )`), '드라이브 간 이동 불가');
  assert.equal(run(context, `getMoveBlockReason(
    { driveId: null, capabilities: { canMoveItemOutOfDrive: false } },
    { id: 'shared-a', driveId: 'shared-a', capabilities: { canAddChildren: true } },
    []
  )`), null);
  assert.equal(run(context, `getMoveBlockReason(
    { driveId: 'shared-a', capabilities: { canMoveItemWithinDrive: false } },
    { id: 'folder-a', driveId: 'shared-a', capabilities: { canAddChildren: true } },
    []
  )`), '이동 권한 없음');
  assert.equal(run(context, `getMoveBlockReason(
    { driveId: null, capabilities: {} },
    { id: 'read-only', driveId: null, capabilities: { canAddChildren: false } },
    []
  )`), '읽기 전용');
});

test('resource-key headers keep raw keys and include each referenced item once', () => {
  const context = loadAppContext();
  assert.equal(
    run(context, `buildResourceKeysHeader([
      { id: 'file', resourceKey: 'raw-key_1' },
      { id: 'folder', resourceKey: 'raw-key_2' },
      { id: 'file', resourceKey: 'ignored-duplicate' },
      { id: 'no-key' }
    ])`),
    'file/raw-key_1,folder/raw-key_2'
  );
});

test('G-drive-scale render mounts at most 240 cards and uses static GIF canvases instead of animated images', () => {
  const context = loadAppContext();
  const { findNodes } = installMiniDom(context);
  const grid = context.document.createElement('div');
  grid.clientWidth = 900;
  context.testGrid = grid;
  run(context, `(() => {
    el.fileGrid = testGrid;
    state.renderWindowStart = 0;
    state.renderRowHeight = 250;
    const files = Array.from({ length: 9788 }, (_, index) => ({
      id: String(index),
      name: index < 501 ? 'animation-' + index + '.gif' : 'photo-' + index + '.jpg',
      mimeType: index < 501 ? 'image/gif' : 'image/jpeg',
      size: '1024',
      thumbnailLink: 'https://example.test/animated.gif',
      capabilities: { canDownload: true }
    }));
    renderMediaGrid(files);
  })()`);
  assert.equal(findNodes(grid, '.file-card').length, 240);
  assert.equal(findNodes(grid, '.file-card-gif-placeholder').length, 240);
  assert.equal(findNodes(grid, '.file-card-gif-canvas').length, 240);
  assert.equal(findNodes(grid, 'img').length, 0);
  assert.equal(
    findNodes(grid, '.file-card-gif-canvas').reduce((pixels, canvas) => pixels + canvas.width * canvas.height, 0),
    240,
    'offscreen GIF canvases must keep only their 1x1 placeholder backing store'
  );
});

test('GIF thumbnail loader draws one static cover frame and then releases the detached image', async () => {
  const context = loadAppContext();
  const result = await run(context, `(async () => {
    const classes = new Set();
    let drawCalls = 0;
    let released = 0;
    class TestImage {
      constructor() {
        this.naturalWidth = 640;
        this.naturalHeight = 360;
      }
      set src(_value) { setTimeout(() => this.onload?.(), 0); }
      removeAttribute(name) { if (name === 'src') released += 1; }
    }
    Image = TestImage;
    const canvas = {
      isConnected: true,
      width: 1,
      height: 1,
      classList: { add(name) { classes.add(name); } },
      getContext() { return { drawImage() { drawCalls += 1; } }; }
    };
    const visual = { classList: { add(name) { classes.add(name); } } };
    const placeholder = { hidden: false };
    queueStaticGifThumbnail(
      { id: 'gif-1', thumbnailLink: 'https://example.test/static-gif-thumb' },
      canvas,
      visual,
      placeholder
    );
    for (let attempt = 0; attempt < 40 && !(drawCalls === 1 && activeGifThumbnailLoads === 0); attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    return JSON.stringify({
      drawCalls,
      released,
      width: canvas.width,
      height: canvas.height,
      placeholderHidden: placeholder.hidden,
      loaded: classes.has('loaded'),
      hasThumbnail: classes.has('has-thumbnail'),
      active: activeGifThumbnailLoads
    });
  })()`);
  assert.deepEqual(JSON.parse(result), {
    drawCalls: 1,
    released: 1,
    width: 320,
    height: 320,
    placeholderHidden: true,
    loaded: true,
    hasThumbnail: true,
    active: 0
  });
});

test('GIF thumbnail backing pixels exist only near the viewport and are released after exit', async () => {
  const context = loadAppContext();
  installMiniDom(context);
  const result = await run(context, `(async () => {
    let observerCallback = null;
    const observed = [];
    const images = [];
    let drawCalls = 0;
    IntersectionObserver = class {
      constructor(callback) { observerCallback = callback; }
      observe(target) { observed.push(target); }
      unobserve() {}
      disconnect() {}
    };
    Image = class {
      constructor() {
        this.naturalWidth = 640;
        this.naturalHeight = 360;
        images.push(this);
      }
      set src(_value) {}
      removeAttribute() {}
    };
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    canvas.isConnected = true;
    canvas.getContext = () => ({ drawImage() { drawCalls += 1; } });
    const visual = document.createElement('div');
    const placeholder = document.createElement('div');
    placeholder.hidden = false;
    registerStaticGifThumbnail(
      { id: 'gif-visible', thumbnailLink: 'https://example.test/gif-thumb' },
      canvas,
      visual,
      placeholder,
      false
    );
    const beforeEnter = { observed: observed.length, images: images.length, pixels: canvas.width * canvas.height };
    observerCallback([{ target: canvas, isIntersecting: true }]);
    await new Promise((resolve) => setTimeout(resolve, 10));
    images[0].onload();
    await new Promise((resolve) => setTimeout(resolve, 10));
    const near = {
      pixels: canvas.width * canvas.height,
      loaded: canvas.classList.contains('loaded'),
      placeholderHidden: placeholder.hidden,
      drawCalls
    };
    observerCallback([{ target: canvas, isIntersecting: false }]);
    const far = {
      pixels: canvas.width * canvas.height,
      loaded: canvas.classList.contains('loaded'),
      placeholderHidden: placeholder.hidden,
      active: activeGifThumbnailLoads
    };
    return JSON.stringify({ beforeEnter, near, far });
  })()`);
  assert.deepEqual(JSON.parse(result), {
    beforeEnter: { observed: 1, images: 0, pixels: 1 },
    near: { pixels: 320 * 320, loaded: true, placeholderHidden: true, drawCalls: 1 },
    far: { pixels: 1, loaded: false, placeholderHidden: false, active: 0 }
  });
});

test('GIF draw failures immediately release the expanded canvas backing store', async () => {
  const context = loadAppContext();
  const result = await run(context, `(async () => {
    const warnings = [];
    console.warn = (...args) => warnings.push(args);
    class TestImage {
      constructor() {
        this.naturalWidth = 640;
        this.naturalHeight = 360;
      }
      set src(_value) { setTimeout(() => this.onload?.(), 0); }
      removeAttribute() {}
    }
    Image = TestImage;
    const canvas = {
      isConnected: true,
      width: 1,
      height: 1,
      classList: { add() {} },
      getContext() { return { drawImage() { throw new Error('context lost'); } }; }
    };
    const placeholder = { hidden: false };
    queueStaticGifThumbnail(
      { id: 'gif-failure', thumbnailLink: 'https://example.test/gif-failure' },
      canvas,
      { classList: { add() {} } },
      placeholder
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    return JSON.stringify({
      pixels: canvas.width * canvas.height,
      placeholderHidden: placeholder.hidden,
      active: activeGifThumbnailLoads,
      warnings: warnings.length
    });
  })()`);
  assert.deepEqual(JSON.parse(result), {
    pixels: 1,
    placeholderHidden: false,
    active: 0,
    warnings: 1
  });
});

test('swipe commits require a dominant deliberate movement or a qualifying flick', () => {
  const context = loadAppContext();
  const check = (primary, cross, elapsed, axis) => run(
    context,
    `shouldCommitSwipe(${primary}, ${cross}, ${elapsed}, ${axis})`
  );

  assert.equal(check(44, 2, 100, 400), false, 'short drag must not commit');
  assert.equal(check(160, 130, 100, 400), false, 'diagonal drag must not commit');
  assert.equal(check(70, 0, 500, 400), false, 'slow short drag must not commit');
  assert.equal(check(100, 10, 500, 400), true, 'deliberate dominant drag must commit');
  assert.equal(check(35, 2, 50, 400), false, 'sub-threshold flick must not commit');
  assert.equal(check(48, 2, 70, 400), true, 'qualifying dominant flick must commit');
});

test('an axis-locked swipe commits from signed distance and velocity without a second dominance test', () => {
  const context = loadAppContext();
  const check = (distance, elapsed, axis) => run(
    context,
    `shouldCommitLockedSwipe(${distance}, ${elapsed}, ${axis})`
  );
  assert.equal(check(100, 500, 400), true, 'locked deliberate drag commits');
  assert.equal(check(48, 70, 400), true, 'locked qualifying flick commits');
  assert.equal(check(44, 40, 400), false, 'sub-threshold flick stays put');
  assert.equal(check(-160, 100, 400), false, 'reversing behind the lock origin never commits');
});

test('frozen swipe navigation commits the previewed file ID even if the surrounding order changes', async () => {
  const context = loadAppContext();
  const result = await run(context, `(async () => {
    const files = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    state.playbackSession = 9;
    state.selected = files[0];
    state.playbackOrderIds = ['a', 'b', 'c'];
    state.playbackDeck = { anchorId: 'a', above: ['c'], below: ['b'] };
    state.populationComplete = true;
    el.playerSheet = { hidden: false };
    getPlaybackFileList = () => files;
    let animatedTarget = '';
    let openedTarget = '';
    animateMediaTransition = async (_direction, callback, target) => {
      animatedTarget = target.id;
      state.playbackOrderIds = ['a', 'c', 'b'];
      callback();
    };
    openMediaSource = (target) => { openedTarget = target.id; state.selected = target; };
    warmPlaybackNeighborhood = () => {};
    await playFrozenSwipeTarget('b', 'left');
    return JSON.stringify({ animatedTarget, openedTarget, selected: state.selected.id });
  })()`);
  assert.deepEqual(JSON.parse(result), {
    animatedTarget: 'b',
    openedTarget: 'b',
    selected: 'b'
  });
});

test('video transition keeps the neighbour poster until a frame is actually presented', () => {
  const context = loadAppContext();
  const result = JSON.parse(run(context, `(() => {
    const classes = new Set();
    let frameCallback = null;
    let hiddenNeighbours = 0;
    const video = {
      hidden: false,
      dataset: { mediaSession: '4' },
      classList: {
        add(name) { classes.add(name); },
        remove(name) { classes.delete(name); }
      },
      removeAttribute() {},
      requestVideoFrameCallback(callback) { frameCallback = callback; }
    };
    state.mediaSession = 4;
    state.selected = { id: 'video' };
    el.videoPlayer = video;
    el.imageViewer = { hidden: true };
    el.mediaLoading = { hidden: false };
    el.mediaError = { hidden: false };
    updateQualityDisplay = () => {};
    tryCaptureAmbientFrame = () => {};
    hideSwipeNeighbor = () => { hiddenNeighbours += 1; };
    onMediaReady();
    const beforeFrame = {
      hiddenNeighbours,
      ready: classes.has('is-ready'),
      loadingHidden: el.mediaLoading.hidden
    };
    frameCallback?.(0, { mediaTime: 0 });
    return JSON.stringify({
      beforeFrame,
      afterFrame: {
        hiddenNeighbours,
        ready: classes.has('is-ready'),
        loadingHidden: el.mediaLoading.hidden
      }
    });
  })()`));
  assert.deepEqual(result, {
    beforeFrame: { hiddenNeighbours: 0, ready: false, loadingHidden: false },
    afterFrame: { hiddenNeighbours: 1, ready: true, loadingHidden: true }
  });
});

test('opt-in media trace is redacted, session-correlated and added to media URLs only while active', () => {
  const context = loadAppContext();
  const result = JSON.parse(run(context, `(() => {
    const events = [];
    globalThis.__driveOriginalMediaTraceSink = (event) => events.push(event);
    const file = { id: 'private-drive-id', name: 'private-name.mp4', mimeType: 'video/mp4', size: '208001508' };
    state.selected = file;
    state.mediaSession = 4;
    beginMediaDiagnosticTrace(file, 4, Date.now());
    const activeUrl = buildMediaUrl(file);
    const traceId = new URL(activeUrl).searchParams.get('_trace');
    const playbackId = events[0].playbackId;
    updateMediaDiagnosticSession(5, 'range-retry');
    state.mediaSession = 5;
    forwardWorkerMediaDiagnostic({
      type: 'MEDIA_TRACE_EVENT', traceId, requestId: 'media-1', sessionId: '4',
      stage: 'request-cancelled', reason: 'request-aborted', terminal: true
    });
    const afterStale = events.length;
    forwardWorkerMediaDiagnostic({
      type: 'MEDIA_TRACE_EVENT', traceId, requestId: 'media-unknown', sessionId: '5',
      stage: 'private-name.mp4', reason: 'must-not-pass'
    });
    const afterUnknown = events.length;
    forwardWorkerMediaDiagnostic({
      type: 'MEDIA_TRACE_EVENT', traceId, requestId: 'media-2', sessionId: '5',
      stage: 'headers', status: 206, requestedRange: 'bytes=0-99', rangeSatisfied: true
    });
    forwardWorkerMediaDiagnostic({
      type: 'MEDIA_TRACE_EVENT', traceId, requestId: 'media-2', sessionId: '5',
      stage: 'first-byte-timeout', status: 504, reason: 'first-byte-timeout', terminal: true
    });
    forwardWorkerMediaDiagnostic({
      type: 'MEDIA_TRACE_EVENT', traceId, requestId: 'media-2', sessionId: '5',
      stage: 'body-no-progress', status: 504, reason: 'body-no-progress', terminal: true
    });
    finishMediaDiagnosticTrace('closed');
    const inactiveUrl = buildMediaUrl(file);
    return JSON.stringify({
      events,
      traceId,
      playbackId,
      afterStale,
      afterUnknown,
      activeTrace: new URL(activeUrl).searchParams.get('_trace'),
      inactiveTrace: new URL(inactiveUrl).searchParams.get('_trace')
    });
  })()`));

  assert.equal(result.traceId, result.playbackId);
  assert.equal(result.activeTrace, result.traceId);
  assert.equal(result.inactiveTrace, null);
  assert.equal(result.afterStale, 3, 'a prior-session cancellation remains in the correlated trace');
  assert.equal(result.afterUnknown, 3, 'unknown worker stages cannot enter the diagnostic sink');
  assert.deepEqual(result.events.map((event) => event.stage), [
    'intent', 'session-changed', 'request-cancelled', 'headers', 'first-byte-timeout', 'body-no-progress', 'trace-finished'
  ]);
  assert.equal(result.events[0].fileKey, 'file-1');
  assert.equal(result.events[2].requestId, 'media-1');
  assert.equal(result.events[2].stale, true);
  assert.equal(result.events[3].requestId, 'media-2');
  assert.equal(result.events[4].reason, 'first-byte-timeout');
  assert.equal(result.events[4].terminal, true);
  assert.equal(result.events[5].reason, 'body-no-progress');
  assert.equal(result.events[5].terminal, true);
  assert.doesNotMatch(JSON.stringify(result.events), /private-drive-id|private-name\.mp4/);
});

test('a superseded playback keeps its cancellation trace without mutating the newer file session', () => {
  const context = loadAppContext();
  const result = JSON.parse(run(context, `(() => {
    const events = [];
    globalThis.__driveOriginalMediaTraceSink = (event) => events.push(event);
    state.selected = { id: 'private-file-a', mimeType: 'video/mp4' };
    state.mediaSession = 11;
    beginMediaDiagnosticTrace(state.selected, 11, Date.now());
    const oldTraceId = mediaDiagnosticTrace.traceId;
    finishMediaDiagnosticTrace('superseded');
    state.selected = { id: 'private-file-b', mimeType: 'video/mp4' };
    state.mediaSession = 12;
    beginMediaDiagnosticTrace(state.selected, 12, Date.now() + 1);
    const newTraceId = mediaDiagnosticTrace.traceId;
    forwardWorkerMediaDiagnostic({
      type: 'MEDIA_TRACE_EVENT', traceId: oldTraceId, requestId: 'media-old',
      sessionId: '11', stage: 'request-cancelled', reason: 'request-aborted', terminal: true
    });
    forwardWorkerMediaDiagnostic({
      type: 'MEDIA_TRACE_EVENT', traceId: newTraceId, requestId: 'media-new',
      sessionId: '12', stage: 'headers', status: 206, rangeSatisfied: true
    });
    return JSON.stringify({
      events,
      selectedId: state.selected.id,
      mediaSession: state.mediaSession,
      mediaAttempt: state.mediaAttempt,
      oldTraceId,
      newTraceId
    });
  })()`));

  const oldEvents = result.events.filter((event) => event.traceId === result.oldTraceId);
  const newEvents = result.events.filter((event) => event.traceId === result.newTraceId);
  assert.deepEqual(oldEvents.map((event) => event.stage), ['intent', 'trace-finished', 'request-cancelled']);
  assert.equal(oldEvents.at(-1).stale, true);
  assert.deepEqual(newEvents.map((event) => event.stage), ['intent', 'headers']);
  assert.equal(result.selectedId, 'private-file-b');
  assert.equal(result.mediaSession, 12);
  assert.doesNotMatch(JSON.stringify(result.events), /private-file-a|private-file-b/);
});

test('a superseded direct full-original request reports late bytes and cancellation to its retired trace', () => {
  const context = loadAppContext();
  const result = JSON.parse(run(context, `(() => {
    const events = [];
    globalThis.__driveOriginalMediaTraceSink = (event) => events.push(event);
    state.selected = { id: 'private-direct-a', mimeType: 'video/mp4' };
    state.mediaSession = 41;
    beginMediaDiagnosticTrace(state.selected, 41, Date.now());
    const oldTraceId = mediaDiagnosticTrace.traceId;
    const requestId = beginDirectMediaDiagnosticRequest(41, 1);
    finishMediaDiagnosticTrace('superseded');
    state.selected = { id: 'private-direct-b', mimeType: 'video/mp4' };
    state.mediaSession = 42;
    beginMediaDiagnosticTrace(state.selected, 42, Date.now() + 1);
    const newTraceId = mediaDiagnosticTrace.traceId;
    emitDirectMediaDiagnosticStage(41, requestId, 'headers', { status: 200, totalBytes: 16 });
    recordDirectMediaDiagnosticBytes(41, requestId, 1, 16);
    emitDirectMediaDiagnosticStage(41, requestId, 'request-cancelled', {
      reason: 'session-cancelled'
    }, { terminal: true });
    return JSON.stringify({
      events,
      oldTraceId,
      newTraceId,
      selectedId: state.selected.id,
      mediaSession: state.mediaSession,
      requestRetained: mediaDiagnosticDirectRequestOwners.has(requestId)
    });
  })()`));

  const oldEvents = result.events.filter((event) => event.traceId === result.oldTraceId);
  const newEvents = result.events.filter((event) => event.traceId === result.newTraceId);
  assert.deepEqual(oldEvents.map((event) => event.stage), [
    'intent', 'request-start', 'trace-finished', 'headers', 'first-byte', 'request-cancelled'
  ]);
  assert.ok(oldEvents.slice(3).every((event) => event.stale === true));
  assert.deepEqual(newEvents.map((event) => event.stage), ['intent']);
  assert.equal(result.requestRetained, false);
  assert.equal(result.selectedId, 'private-direct-b');
  assert.equal(result.mediaSession, 42);
  assert.doesNotMatch(JSON.stringify(result.events), /private-direct-a|private-direct-b/);
});

test('media trace does not call metadata a decoded frame and waits for frame presentation', () => {
  const context = loadAppContext();
  const result = JSON.parse(run(context, `(() => {
    const events = [];
    globalThis.__driveOriginalMediaTraceSink = (event) => events.push(event);
    state.mediaSession = 8;
    state.selected = { id: 'video-id', mimeType: 'video/mp4' };
    beginMediaDiagnosticTrace(state.selected, 8, Date.now());
    let frameCallback = null;
    const classes = new Set();
    const video = {
      hidden: false,
      currentTime: 0,
      dataset: { mediaSession: '8' },
      classList: { add(name) { classes.add(name); }, remove(name) { classes.delete(name); } },
      removeAttribute() {},
      requestVideoFrameCallback(callback) { frameCallback = callback; }
    };
    el.videoPlayer = video;
    el.imageViewer = { hidden: true };
    el.mediaLoading = { hidden: false };
    el.mediaError = { hidden: false };
    updateQualityDisplay = () => {};
    tryCaptureAmbientFrame = () => {};
    hideSwipeNeighbor = () => {};
    emitMediaDiagnosticStage('media-metadata', { confidence: 'container-metadata' }, 8);
    onMediaReady();
    const before = events.map((event) => event.stage);
    const decodedBeforeFrame = state.mediaDecodeVerified;
    frameCallback?.(0, { mediaTime: 0 });
    const after = events.map((event) => event.stage);
    return JSON.stringify({
      before,
      after,
      decodedBeforeFrame,
      decodedAfterFrame: state.mediaDecodeVerified,
      ready: classes.has('is-ready')
    });
  })()`));

  assert.equal(result.before.includes('first-decoded-frame'), false);
  assert.equal(result.after.includes('first-decoded-frame'), true);
  assert.equal(result.decodedBeforeFrame, false);
  assert.equal(result.decodedAfterFrame, true);
  assert.equal(result.ready, true);
});

test('media element errors remain provisional until the worker classification window closes', async () => {
  const context = loadAppContext();
  const result = JSON.parse(await run(context, `(async () => {
    const events = [];
    globalThis.__driveOriginalMediaTraceSink = (event) => events.push(event);
    state.selected = { id: 'private-video-id', mimeType: 'video/mp4' };
    state.mediaSession = 21;
    state.mediaAttempt = 'range';
    state.token = 'private-token';
    state.expiresAt = Date.now() + 60_000;
    el.videoPlayer = {
      error: { code: 4 },
      getAttribute(name) { return name === 'src' ? 'blob:private-source' : ''; }
    };
    beginMediaDiagnosticTrace(state.selected, 21, Date.now());
    const traceId = mediaDiagnosticTrace.traceId;
    window.setTimeout = (resolve) => {
      forwardWorkerMediaDiagnostic({
        type: 'MEDIA_TRACE_EVENT', traceId, requestId: 'media-http', sessionId: '21',
        stage: 'http-error', status: 401, reason: 'credential-rejected', terminal: true
      });
      state.lastProxyError = { status: 401, category: 'auth', reasons: [] };
      resolve();
      return 1;
    };
    await handleMediaElementError('video');
    return JSON.stringify({ events, mediaAttempt: state.mediaAttempt });
  })()`));

  assert.deepEqual(result.events.map((event) => event.stage), [
    'intent', 'media-error', 'http-error', 'media-error-classified'
  ]);
  assert.equal(result.events[1].terminal, false);
  assert.equal(result.events[1].confidence, 'provisional');
  assert.equal(result.events[2].terminal, true);
  assert.equal(result.events[3].terminal, true);
  assert.equal(result.events[3].reason, 'proxy-auth');
  assert.equal(result.mediaAttempt, 'range');
  assert.doesNotMatch(JSON.stringify(result.events), /private-video-id|private-token|blob:private-source/);
});

test('frame watchdog starts only after positive media bytes and keeps one recovery owner', async () => {
  const context = loadAppContext();
  const clock = installFakeClock(context);
  await run(context, `(async () => {
    globalThis.watchdogEvents = [];
    globalThis.watchdogRecoveries = [];
    globalThis.watchdogActions = [];
    globalThis.__driveOriginalMediaTraceSink = (event) => watchdogEvents.push(event);
    const file = {
      id: 'frame-stall', mimeType: 'video/mp4', size: '1000',
      capabilities: { canDownload: true }
    };
    const video = {
      hidden: false, paused: false, ended: false, seeking: false, currentTime: 0,
      dataset: { mediaSession: '51' }, error: { code: 4 },
      getAttribute(name) { return name === 'src' ? '/__drive_media/frame-stall' : ''; }
    };
    state.selected = file;
    state.mediaSession = 51;
    state.mediaAttempt = 'range';
    state.mediaPlaybackMode = PLAYBACK_MODE.RANGE;
    state.mediaTransportVerified = false;
    state.mediaTransportStarted = false;
    state.mediaRetryCount = 0;
    state.token = 'fixture-token';
    state.expiresAt = Date.now() + 60_000;
    el.videoPlayer = video;
    el.playerSheet = { hidden: false };
    beginMediaDiagnosticTrace(file, 51, mediaDiagnosticTimestamp());
    const originalRecover = recoverFromMediaProxyError;
    recoverFromMediaProxyError = async (failure) => {
      watchdogRecoveries.push({
        type: failure.type,
        status: failure.status,
        category: failure.category,
        driveReason: failure.driveReason,
        frameReason: failure.frameReason
      });
      return originalRecover(failure);
    };
    scheduleOriginalStreamRetry = (selected, session, delay) => {
      watchdogActions.push({ type: 'range-retry', id: selected.id, session, delay });
      state.mediaAttempt = 'retry-wait';
    };
    offerOriginalBufferFallback = async () => { watchdogActions.push({ type: 'buffer' }); };
    showDrivePreview = () => { watchdogActions.push({ type: 'preview' }); };

    await handleWorkerMessage({ data: {
      type: 'MEDIA_PROXY_STATUS', fileId: file.id, sessionId: '51',
      requestedRange: 'bytes=0-', contentRange: 'bytes 0-999/1000',
      status: 206, rangeSatisfied: true, playbackMode: PLAYBACK_MODE.RANGE
    } });
    globalThis.watchdogAfterHeaders = mediaFrameWatchdog !== null;
    await handleWorkerMessage({ data: {
      type: 'MEDIA_PROXY_PROGRESS', stage: 'first-byte', fileId: file.id, sessionId: '50'
    } });
    globalThis.watchdogAfterStaleByte = mediaFrameWatchdog !== null;
    await handleWorkerMessage({ data: {
      type: 'MEDIA_PROXY_PROGRESS', stage: 'first-byte', fileId: file.id, sessionId: '51',
      sourceGeneration: mediaSourceGeneration + 1
    } });
    globalThis.watchdogAfterStaleSource = mediaFrameWatchdog !== null;
    await handleWorkerMessage({ data: {
      type: 'MEDIA_PROXY_PROGRESS', stage: 'first-byte', fileId: file.id, sessionId: '51',
      sourceGeneration: mediaSourceGeneration
    } });
    globalThis.watchdogAfterCurrentByte = mediaFrameWatchdog !== null;
  })()`);

  assert.equal(run(context, 'watchdogAfterHeaders'), false);
  assert.equal(run(context, 'watchdogAfterStaleByte'), false);
  assert.equal(run(context, 'watchdogAfterStaleSource'), false);
  assert.equal(run(context, 'watchdogAfterCurrentByte'), true);
  assert.equal(clock.scheduled.size, 1);
  assert.equal([...clock.scheduled.values()][0].delay, 15_000);

  clock.advance(14_999);
  assert.equal(run(context, 'watchdogRecoveries.length'), 0);
  clock.advance(1);
  await Promise.resolve();
  assert.deepEqual(JSON.parse(run(context, 'JSON.stringify(watchdogRecoveries)')), [{
    type: 'MEDIA_FRAME_NO_PROGRESS',
    status: 504,
    category: 'timeout',
    driveReason: 'frameNoProgress',
    frameReason: 'initial-frame-no-progress'
  }]);
  assert.deepEqual(JSON.parse(run(context, 'JSON.stringify(watchdogActions)')), [
    { type: 'range-retry', id: 'frame-stall', session: 51, delay: 700 }
  ]);

  clock.captured[0].callback();
  await run(context, `(async () => {
    const lateFailure = {
      type: 'MEDIA_PROXY_ERROR', fileId: 'frame-stall', sessionId: '51',
      status: 504, category: 'timeout', driveReason: 'bodyNoProgress'
    };
    await handleWorkerMessage({ data: lateFailure });
    await handleMediaElementError('video');
  })()`);
  assert.equal(run(context, 'watchdogRecoveries.length'), 1);
  assert.equal(run(context, 'watchdogActions.length'), 1);
  const terminalEvents = JSON.parse(run(context, `JSON.stringify(
    watchdogEvents.filter((event) => event.stage === 'frame-no-progress')
  )`));
  assert.equal(terminalEvents.length, 1);
  assert.equal(terminalEvents[0].reason, 'initial-frame-no-progress');
  assert.equal(terminalEvents[0].terminal, true);
});

test('actual frame time progress renews one watchdog lease while duplicate frames do not', async () => {
  const context = loadAppContext();
  const clock = installFakeClock(context);
  run(context, `(() => {
    globalThis.frameLeaseEvents = [];
    globalThis.frameLeaseRecoveries = [];
    globalThis.__driveOriginalMediaTraceSink = (event) => frameLeaseEvents.push(event);
    state.selected = { id: 'progressing-video', mimeType: 'video/mp4', capabilities: { canDownload: true } };
    state.mediaSession = 61;
    state.mediaAttempt = 'range';
    state.mediaPlaybackMode = PLAYBACK_MODE.RANGE;
    state.mediaTransportVerified = true;
    state.mediaTransportStarted = true;
    const video = {
      hidden: false, paused: false, ended: false, seeking: false, currentTime: 0,
      dataset: { mediaSession: '61' }
    };
    el.videoPlayer = video;
    el.playerSheet = { hidden: false };
    beginMediaDiagnosticTrace(state.selected, 61, mediaDiagnosticTimestamp());
    recoverFromMediaProxyError = async (failure) => {
      frameLeaseRecoveries.push({ driveReason: failure.driveReason, frameReason: failure.frameReason });
      state.mediaAttempt = 'retry-wait';
    };
    syncMediaFrameWatchdog();
  })()`);

  clock.advance(14_000);
  assert.equal(run(context, 'noteMediaFrameProgress(el.videoPlayer, 0, "decoded-frame")'), true);
  assert.equal(run(context, 'state.mediaDecodeVerified'), true);
  assert.equal(clock.scheduled.size, 1, 'frame progress updates the lease without timer churn');
  clock.advance(1_000);
  assert.equal(run(context, 'frameLeaseRecoveries.length'), 0);
  assert.equal(clock.scheduled.size, 1);
  assert.equal([...clock.scheduled.values()][0].delay, 14_000);

  clock.advance(10_000);
  assert.equal(run(context, 'noteMediaFrameProgress(el.videoPlayer, 0.04, "decoded-frame")'), true);
  const progressAt = run(context, 'mediaFrameWatchdog.lastProgressAt');
  clock.advance(1_000);
  assert.equal(run(context, 'noteMediaFrameProgress(el.videoPlayer, 0.04, "decoded-frame")'), false);
  assert.equal(run(context, 'mediaFrameWatchdog.lastProgressAt'), progressAt);
  clock.advance(3_000);
  assert.equal(run(context, 'frameLeaseRecoveries.length'), 0);
  clock.advance(11_000);
  await Promise.resolve();

  assert.deepEqual(JSON.parse(run(context, 'JSON.stringify(frameLeaseRecoveries)')), [{
    driveReason: 'frameNoProgress',
    frameReason: 'playback-frame-no-progress'
  }]);
  assert.equal(JSON.parse(run(context, `JSON.stringify(
    frameLeaseEvents.filter((event) => event.stage === 'frame-no-progress')
  )`)).length, 1);
});

test('timeupdate is a monotonic fallback only when frame callbacks are unavailable and no seek is active', () => {
  const context = loadAppContext();
  const clock = installFakeClock(context);
  run(context, `(() => {
    state.selected = { id: 'fallback-clock', mimeType: 'video/mp4' };
    state.mediaSession = 66;
    state.mediaAttempt = 'range';
    state.mediaPlaybackMode = PLAYBACK_MODE.SEQUENTIAL;
    state.mediaTransportVerified = true;
    state.mediaTransportStarted = true;
    el.videoPlayer = {
      hidden: false, paused: false, ended: false, seeking: false, currentTime: 0,
      dataset: { mediaSession: '66' }
    };
    el.playerSheet = { hidden: false };
    syncMediaFrameWatchdog();
  })()`);
  clock.advance(14_000);
  run(context, 'el.videoPlayer.currentTime=0.5;onVideoTimeUpdate()');
  const progressedAt = run(context, 'mediaFrameWatchdog.lastProgressAt');
  assert.equal(progressedAt, clock.now());
  assert.equal(run(context, 'state.mediaDecodeVerified'), true);

  clock.advance(500);
  run(context, 'state.isSeeking=true;el.videoPlayer.seeking=true;el.videoPlayer.currentTime=30;onVideoTimeUpdate()');
  assert.equal(run(context, 'mediaFrameWatchdog.lastProgressAt'), progressedAt);
});

test('seek completion requires seeked plus a decoded frame at each requested target', () => {
  const context = loadAppContext();
  const clock = installFakeClock(context);
  run(context, `(() => {
    globalThis.seekEvents = [];
    globalThis.__driveOriginalMediaTraceSink = (event) => seekEvents.push(event);
    state.selected = { id: 'seek-target-video', mimeType: 'video/mp4' };
    state.mediaSession = 67;
    state.playbackSession = 9;
    state.mediaAttempt = 'range';
    state.mediaPlaybackMode = PLAYBACK_MODE.RANGE;
    state.mediaTransportVerified = true;
    state.mediaTransportStarted = true;
    el.videoPlayer = {
      hidden: false, paused: false, ended: false, seeking: true,
      currentTime: 0, duration: 100, dataset: { mediaSession: '67' },
      requestVideoFrameCallback() { return 1; }, cancelVideoFrameCallback() {}
    };
    el.playerSheet = { hidden: false };
    el.mediaError = { hidden: true };
    el.imageViewer = { hidden: true };
    updateQualityDisplay = () => {};
    beginMediaDiagnosticTrace(state.selected, 67, mediaDiagnosticTimestamp());
  })()`);

  for (const target of [10, 50, 90]) {
    run(context, `(() => {
      el.videoPlayer.currentTime = ${target};
      el.videoPlayer.seeking = true;
      beginMediaSeekIntent(el.videoPlayer, ${target}, 'fixture');
    })()`);
    const generation = run(context, 'mediaSeekWatchdog.seekGeneration');
    assert.equal(run(context, 'mediaSeekWatchdog !== null'), true);
    assert.equal(clock.scheduled.size, 1);
    run(context, 'onMediaReady();beginVideoFrameSampling()');
    assert.equal(run(context, 'mediaSeekWatchdog.seekedSeen'), false, 'metadata and canplay are not seek completion');

    run(context, `(() => {
      el.videoPlayer.seeking = false;
      state.isSeeking = false;
      noteMediaSeeked(el.videoPlayer, ${generation});
    })()`);
    assert.equal(run(context, 'mediaSeekWatchdog !== null'), true, 'seeked alone is not displayed-frame proof');
    assert.equal(run(context, `noteMediaSeekFrameProgress(
      el.videoPlayer, ${target - 5}, 'decoded-frame', mediaSourceGeneration, ${generation}
    )`), false, 'a frame from the old position cannot finish the seek');
    assert.equal(run(context, `noteMediaSeekFrameProgress(
      el.videoPlayer, ${target}, 'decoded-frame', mediaSourceGeneration, ${generation}
    )`), true);
    assert.equal(run(context, 'mediaSeekWatchdog'), null);
    assert.equal(run(context, 'mediaFrameWatchdog !== null'), true, 'ordinary frame monitoring resumes');
    assert.equal(clock.scheduled.size, 1);
  }

  const completed = JSON.parse(run(context, `JSON.stringify(
    seekEvents.filter((event) => event.stage === 'seek-frame')
  )`));
  assert.deepEqual(completed.map((event) => event.presentedMediaTime), [10, 50, 90]);
  assert.deepEqual(completed.map((event) => event.seekGeneration), [1, 2, 3]);

  run(context, `(() => {
    el.videoPlayer.paused = true;
    el.videoPlayer.currentTime = 75;
    el.videoPlayer.seeking = true;
    globalThis.frameFirstGeneration = beginMediaSeekIntent(el.videoPlayer, 75, 'frame-first');
    globalThis.frameFirstCompletedEarly = noteMediaSeekFrameProgress(
      el.videoPlayer, 75, 'decoded-frame', mediaSourceGeneration, frameFirstGeneration
    );
  })()`);
  assert.equal(run(context, 'frameFirstCompletedEarly'), false);
  assert.equal(run(context, 'mediaSeekWatchdog.frameSeen'), true, 'target frame is retained before seeked');
  run(context, `(() => {
    el.videoPlayer.seeking = false;
    state.isSeeking = false;
    globalThis.frameFirstSeekedAccepted = noteMediaSeeked(el.videoPlayer, frameFirstGeneration);
  })()`);
  assert.equal(run(context, 'frameFirstSeekedAccepted'), true);
  assert.equal(run(context, 'mediaSeekWatchdog'), null, 'seeked completes a retained target frame');
  const frameFirstCompletion = JSON.parse(run(context, `JSON.stringify(
    seekEvents.filter((event) => event.stage === 'seek-frame').at(-1)
  )`));
  assert.equal(frameFirstCompletion.presentedMediaTime, 75);
  assert.equal(frameFirstCompletion.confidence, 'decoded-frame');
});

function installDelayedSeekFixture(context, playbackRate = 1) {
  run(context, `(() => {
    globalThis.delayedSeekFrames = [];
    globalThis.delayedSeekEvents = [];
    globalThis.delayedSeekRecoveries = [];
    globalThis.__driveOriginalMediaTraceSink = event => delayedSeekEvents.push(event);
    state.selected = { id: 'delayed-frame-video', mimeType: 'video/mp4' };
    state.mediaSession = 71;
    state.playbackSession = 13;
    state.mediaAttempt = 'range';
    state.mediaPlaybackMode = PLAYBACK_MODE.RANGE;
    state.mediaTransportVerified = true;
    state.mediaTransportStarted = true;
    el.videoPlayer = {
      hidden: false, paused: false, ended: false, seeking: true,
      currentTime: 50, duration: 100, playbackRate: ${playbackRate},
      dataset: { mediaSession: '71' },
      requestVideoFrameCallback(callback) {
        delayedSeekFrames.push(callback); return delayedSeekFrames.length;
      },
      cancelVideoFrameCallback() {}
    };
    el.playerSheet = { hidden: false };
    recoverFromMediaProxyError = async failure => delayedSeekRecoveries.push(failure);
    beginMediaDiagnosticTrace(state.selected, 71, mediaDiagnosticTimestamp());
    beginMediaSeekIntent(el.videoPlayer, 50, 'delayed-presentation');
    el.videoPlayer.seeking = false;
    handleVideoSeeked({ currentTarget: el.videoPlayer });
  })()`);
}

test('a delayed owned decoded frame completes a playing seek at its advancing playhead', () => {
  const context = loadAppContext();
  const clock = installFakeClock(context);
  installDelayedSeekFixture(context);
  clock.advance(886);
  run(context, `el.videoPlayer.currentTime=50.818;
    delayedSeekFrames[0](0, { mediaTime: 50.831528 });`);
  assert.equal(run(context, 'mediaSeekWatchdog'), null);
  assert.equal(run(context, 'mediaFrameWatchdog !== null'), true);
  const frames = JSON.parse(run(context, `JSON.stringify(delayedSeekEvents.filter(e => e.stage === 'seek-frame'))`));
  assert.equal(frames.length, 1);
  assert.equal(frames[0].targetTime, 50);
  assert.equal(frames[0].presentedMediaTime, 50.831528);
  assert.equal(run(context, 'delayedSeekRecoveries.length'), 0);
});

test('delayed seek presentation rejects stale, unrelated, implausible and paint-only frames', () => {
  const context = loadAppContext();
  const clock = installFakeClock(context);
  installDelayedSeekFixture(context);
  clock.advance(1000);
  run(context, 'el.videoPlayer.currentTime=51');
  for (const expression of [
    'noteMediaSeekFrameProgress(el.videoPlayer, 10)',
    'noteMediaSeekFrameProgress(el.videoPlayer, 51, "decoded-frame", mediaSourceGeneration, mediaSeekGeneration-1)',
    'noteMediaSeekFrameProgress(el.videoPlayer, 51, "decoded-frame", mediaSourceGeneration+1)',
    'noteMediaSeekFrameProgress(el.videoPlayer, 51, "paint-only")'
  ]) assert.equal(run(context, expression), false);
  run(context, 'el.videoPlayer.currentTime=80');
  assert.equal(run(context, 'noteMediaSeekFrameProgress(el.videoPlayer, 80)'), false,
    'matching currentTime is insufficient for an impossible scene jump');
  assert.equal(run(context, 'mediaSeekWatchdog.frameSeen'), false);
  run(context, 'el.videoPlayer.currentTime=51;delayedSeekFrames[0](0, {mediaTime:51})');
  assert.equal(run(context, 'mediaSeekWatchdog'), null);
  assert.equal(run(context, 'delayedSeekRecoveries.length'), 0);
});

test('delayed seek timeline accounts for rate changes, paused time and hidden playback separately', () => {
  const context = loadAppContext();
  const clock = installFakeClock(context);
  installDelayedSeekFixture(context, 2);
  clock.advance(1000);
  run(context, 'el.videoPlayer.currentTime=52;el.videoPlayer.playbackRate=0.5;syncMediaSeekWatchdog()');
  clock.advance(1000);
  run(context, 'el.videoPlayer.currentTime=52.5;el.videoPlayer.paused=true;syncMediaSeekWatchdog()');
  const remaining = run(context, 'mediaSeekWatchdog.remainingMs');
  clock.advance(4000);
  assert.equal(run(context, 'noteMediaSeekFrameProgress(el.videoPlayer, 52.5)'), false,
    'paused seek still requires the exact target frame');
  run(context, 'el.videoPlayer.paused=false;syncMediaSeekWatchdog();el.videoPlayer.currentTime=54');
  assert.equal(run(context, 'noteMediaSeekFrameProgress(el.videoPlayer, 54)'), false,
    'paused elapsed time cannot authorize playback advancement');
  run(context, 'document.visibilityState="hidden";syncMediaSeekWatchdog()');
  clock.advance(2000);
  assert.equal(run(context, 'mediaSeekWatchdog.remainingMs'), remaining);
  run(context, 'document.visibilityState="visible";syncMediaSeekWatchdog();el.videoPlayer.currentTime=53.5');
  run(context, 'delayedSeekFrames[0](0, { mediaTime:53.5 })');
  assert.equal(run(context, 'mediaSeekWatchdog'), null,
    'hidden playing time can advance the scene while timeout spending remains suspended');
  assert.equal(run(context, 'delayedSeekRecoveries.length'), 0);
});

test('advancing currentTime without an owned decoded frame still reaches seek recovery once', () => {
  const context = loadAppContext();
  const clock = installFakeClock(context);
  installDelayedSeekFixture(context);
  run(context, 'el.videoPlayer.currentTime=60');
  clock.advance(15_000);
  assert.equal(run(context, 'delayedSeekRecoveries.length'), 1);
  assert.equal(run(context, 'mediaSeekWatchdog'), null);
});

test('seek completion times out once at 15 seconds and delegates to existing Range recovery', async () => {
  const context = loadAppContext();
  const clock = installFakeClock(context);
  run(context, `(() => {
    globalThis.seekTimeoutEvents = [];
    globalThis.seekTimeoutRecoveries = [];
    globalThis.seekTimeoutActions = [];
    globalThis.seekTimeoutFrames = [];
    globalThis.__driveOriginalMediaTraceSink = (event) => seekTimeoutEvents.push(event);
    const file = {
      id: 'seek-timeout-video', mimeType: 'video/mp4', size: '1000',
      capabilities: { canDownload: true }
    };
    state.selected = file;
    state.mediaSession = 68;
    state.playbackSession = 10;
    state.mediaAttempt = 'range';
    state.mediaPlaybackMode = PLAYBACK_MODE.RANGE;
    state.mediaTransportVerified = true;
    state.mediaTransportStarted = true;
    state.mediaRetryCount = 0;
    el.videoPlayer = {
      hidden: false, paused: false, ended: false, seeking: true,
      currentTime: 50, duration: 100, dataset: { mediaSession: '68' }, error: { code: 2 },
      getAttribute(name) { return name === 'src' ? '/__drive_media/seek-timeout-video' : ''; },
      requestVideoFrameCallback(callback) { seekTimeoutFrames.push(callback); return seekTimeoutFrames.length; },
      cancelVideoFrameCallback() {}
    };
    el.playerSheet = { hidden: false };
    beginMediaDiagnosticTrace(file, 68, mediaDiagnosticTimestamp());
    const originalRecover = recoverFromMediaProxyError;
    recoverFromMediaProxyError = async (failure) => {
      seekTimeoutRecoveries.push({
        type: failure.type,
        status: failure.status,
        category: failure.category,
        driveReason: failure.driveReason,
        seekGeneration: failure.seekGeneration,
        targetTime: failure.targetTime
      });
      return originalRecover(failure);
    };
    scheduleOriginalStreamRetry = (selected, session, delay) => {
      seekTimeoutActions.push({ type: 'range-retry', id: selected.id, session, delay });
      state.mediaAttempt = 'retry-wait';
    };
    globalThis.seekTimeoutGeneration = beginMediaSeekIntent(el.videoPlayer, 50, 'fixture');
  })()`);

  assert.equal(clock.scheduled.size, 1);
  const staleTimer = clock.captured[0].callback;
  clock.advance(14_999);
  assert.equal(run(context, 'seekTimeoutRecoveries.length'), 0);
  clock.advance(1);
  await Promise.resolve();

  assert.deepEqual(JSON.parse(run(context, 'JSON.stringify(seekTimeoutRecoveries)')), [{
    type: 'MEDIA_SEEK_NO_PROGRESS',
    status: 504,
    category: 'timeout',
    driveReason: 'seekNoProgress',
    seekGeneration: 1,
    targetTime: 50
  }]);
  assert.deepEqual(JSON.parse(run(context, 'JSON.stringify(seekTimeoutActions)')), [{
    type: 'range-retry', id: 'seek-timeout-video', session: 68, delay: 700
  }]);
  assert.equal(run(context, 'mediaSeekWatchdog'), null);

  staleTimer();
  assert.equal(run(context, `(() => {
    el.videoPlayer.seeking = false;
    state.isSeeking = false;
    const seeked = noteMediaSeeked(el.videoPlayer, seekTimeoutGeneration);
    const frame = noteMediaSeekFrameProgress(
      el.videoPlayer, 50, 'decoded-frame', mediaSourceGeneration, seekTimeoutGeneration
    );
    return seeked || frame;
  })()`), false);
  assert.equal(run(context, 'handleVideoSeeked({ currentTarget: el.videoPlayer })'), false);
  run(context, 'seekTimeoutFrames[0](0, { mediaTime: 50 })');
  await run(context, `(async () => {
    await handleWorkerMessage({ data: {
      type: 'MEDIA_PROXY_ERROR', fileId: 'seek-timeout-video', sessionId: '68',
      sourceGeneration: mediaSourceGeneration, status: 504,
      category: 'timeout', driveReason: 'bodyNoProgress'
    } });
    await handleMediaElementError('video');
  })()`);
  assert.equal(run(context, 'seekTimeoutRecoveries.length'), 1);
  assert.equal(run(context, 'seekTimeoutActions.length'), 1);
  const terminalEvents = JSON.parse(run(context, `JSON.stringify(
    seekTimeoutEvents.filter((event) => event.stage === 'seek-no-progress')
  )`));
  assert.equal(terminalEvents.length, 1);
  assert.equal(terminalEvents[0].terminal, true);
  assert.equal(terminalEvents[0].targetTime, 50);
  assert.equal(JSON.parse(run(context, `JSON.stringify(
    seekTimeoutEvents.filter((event) => ['seeked', 'seek-frame'].includes(event.stage))
  )`)).length, 0, 'late listener and frame signals cannot contradict the terminal trace');
});

test('a classified worker failure beats a captured seek timer and remains the sole recovery owner', async () => {
  const context = loadAppContext();
  const clock = installFakeClock(context);
  run(context, `(() => {
    globalThis.workerFirstEvents = [];
    globalThis.workerFirstRecoveries = [];
    globalThis.workerFirstActions = [];
    globalThis.__driveOriginalMediaTraceSink = (event) => workerFirstEvents.push(event);
    const file = {
      id: 'worker-first-seek', mimeType: 'video/mp4', size: '1000',
      capabilities: { canDownload: true }
    };
    state.selected = file;
    state.mediaSession = 86;
    state.playbackSession = 17;
    state.mediaAttempt = 'range';
    state.mediaPlaybackMode = PLAYBACK_MODE.RANGE;
    state.mediaTransportVerified = true;
    state.mediaTransportStarted = true;
    state.mediaRetryCount = 0;
    el.videoPlayer = {
      hidden: false, paused: false, ended: false, seeking: true,
      currentTime: 35, duration: 100, dataset: { mediaSession: '86' }, error: { code: 2 },
      getAttribute(name) { return name === 'src' ? '/__drive_media/worker-first-seek' : ''; }
    };
    el.playerSheet = { hidden: false };
    beginMediaDiagnosticTrace(file, 86, mediaDiagnosticTimestamp());
    const originalRecover = recoverFromMediaProxyError;
    recoverFromMediaProxyError = async (failure) => {
      workerFirstRecoveries.push(failure.driveReason);
      return originalRecover(failure);
    };
    scheduleOriginalStreamRetry = (selected, session, delay) => {
      workerFirstActions.push({ id: selected.id, session, delay });
      state.mediaAttempt = 'retry-wait';
    };
    beginMediaSeekIntent(el.videoPlayer, 35, 'fixture');
  })()`);
  const staleTimer = clock.captured[0].callback;

  await run(context, `(async () => {
    await handleWorkerMessage({ data: {
      type: 'MEDIA_PROXY_ERROR', fileId: 'worker-first-seek', sessionId: '86',
      sourceGeneration: mediaSourceGeneration, status: 504,
      category: 'timeout', driveReason: 'bodyNoProgress'
    } });
  })()`);
  staleTimer();
  await run(context, 'handleMediaElementError("video")');

  assert.deepEqual(JSON.parse(run(context, 'JSON.stringify(workerFirstRecoveries)')), ['bodyNoProgress']);
  assert.deepEqual(JSON.parse(run(context, 'JSON.stringify(workerFirstActions)')), [
    { id: 'worker-first-seek', session: 86, delay: 700 }
  ]);
  assert.equal(run(context, 'mediaSeekWatchdog'), null);
  assert.equal(JSON.parse(run(context, `JSON.stringify(
    workerFirstEvents.filter((event) => event.stage === 'seek-no-progress')
  )`)).length, 0);
});

test('a newer seek fences stale seeked events, frame callbacks, and timers', () => {
  const context = loadAppContext();
  const clock = installFakeClock(context);
  run(context, `(() => {
    globalThis.rapidSeekEvents = [];
    globalThis.rapidSeekRecoveries = [];
    globalThis.rapidSeekFrames = [];
    globalThis.__driveOriginalMediaTraceSink = (event) => rapidSeekEvents.push(event);
    state.selected = { id: 'rapid-seek-video', mimeType: 'video/mp4' };
    state.mediaSession = 69;
    state.playbackSession = 11;
    state.mediaAttempt = 'range';
    state.mediaPlaybackMode = PLAYBACK_MODE.RANGE;
    state.mediaTransportVerified = true;
    state.mediaTransportStarted = true;
    el.videoPlayer = {
      hidden: false, paused: false, ended: false, seeking: true,
      currentTime: 10, duration: 100, dataset: { mediaSession: '69' },
      requestVideoFrameCallback(callback) { rapidSeekFrames.push(callback); return rapidSeekFrames.length; },
      cancelVideoFrameCallback() {}
    };
    el.playerSheet = { hidden: false };
    beginMediaDiagnosticTrace(state.selected, 69, mediaDiagnosticTimestamp());
    recoverFromMediaProxyError = async (failure) => { rapidSeekRecoveries.push(failure); };
    globalThis.rapidSeekA = beginMediaSeekIntent(el.videoPlayer, 10, 'fixture-a');
  })()`);
  const staleTimer = clock.captured[0].callback;

  run(context, `(() => {
    el.videoPlayer.currentTime = 90;
    el.videoPlayer.seeking = true;
    globalThis.rapidSeekB = beginMediaSeekIntent(el.videoPlayer, 90, 'fixture-b');
  })()`);
  assert.equal(run(context, 'rapidSeekB > rapidSeekA'), true);
  assert.equal(run(context, 'rapidSeekFrames.length'), 2);

  run(context, `(() => {
    globalThis.staleSeekedAccepted = noteMediaSeeked(el.videoPlayer, rapidSeekA);
    el.videoPlayer.currentTime = 10;
    el.videoPlayer.seeking = true;
    state.isSeeking = true;
    globalThis.staleSeekedEventAccepted = handleVideoSeeked({ currentTarget: el.videoPlayer });
    el.videoPlayer.currentTime = 90;
    el.videoPlayer.seeking = false;
    globalThis.currentSeekedAccepted = handleVideoSeeked({ currentTarget: el.videoPlayer });
  })()`);
  staleTimer();
  run(context, 'rapidSeekFrames[0](0, { mediaTime: 90 })');
  assert.equal(run(context, 'staleSeekedAccepted'), false);
  assert.equal(run(context, 'staleSeekedEventAccepted'), false);
  assert.equal(run(context, 'currentSeekedAccepted'), true);
  assert.equal(run(context, 'mediaSeekWatchdog.seekGeneration'), run(context, 'rapidSeekB'));
  assert.equal(run(context, 'rapidSeekRecoveries.length'), 0);
  assert.equal(JSON.parse(run(context, `JSON.stringify(
    rapidSeekEvents.filter((event) => event.stage === 'seek-frame')
  )`)).length, 0);
  const seekedEvents = JSON.parse(run(context, `JSON.stringify(
    rapidSeekEvents.filter((event) => event.stage === 'seeked')
  )`));
  assert.equal(seekedEvents.length, 1, 'a stale seeked event is not attributed to the current generation');
  assert.equal(seekedEvents[0].seekGeneration, run(context, 'rapidSeekB'));

  run(context, 'rapidSeekFrames[1](0, { mediaTime: 90 })');
  assert.equal(run(context, 'mediaSeekWatchdog'), null);
  assert.equal(run(context, 'rapidSeekRecoveries.length'), 0);
  const completions = JSON.parse(run(context, `JSON.stringify(
    rapidSeekEvents.filter((event) => event.stage === 'seek-frame')
  )`));
  assert.equal(completions.length, 1);
  assert.equal(completions[0].seekGeneration, run(context, 'rapidSeekB'));
  assert.equal(completions[0].presentedMediaTime, 90);
});

test('seek clock spends only active foreground time across pause, hidden, offline, and pointer drag', async () => {
  const cases = [
    ['pause', 'el.videoPlayer.paused=true', 'el.videoPlayer.paused=false'],
    ['hidden', 'document.visibilityState="hidden"', 'document.visibilityState="visible"'],
    ['offline', 'navigator.onLine=false', 'navigator.onLine=true'],
    ['pointer', 'isSeekingPointer=true', 'isSeekingPointer=false']
  ];

  for (const [label, suspend, resume] of cases) {
    const context = loadAppContext();
    const clock = installFakeClock(context);
    run(context, `(() => {
      globalThis.suspendedSeekRecoveries = [];
      state.selected = { id: 'seek-${label}', mimeType: 'video/mp4' };
      state.mediaSession = 70;
      state.playbackSession = 12;
      state.mediaAttempt = 'range';
      state.mediaPlaybackMode = PLAYBACK_MODE.RANGE;
      state.mediaTransportVerified = true;
      state.mediaTransportStarted = true;
      el.videoPlayer = {
        hidden: false, paused: false, ended: false, seeking: true,
        currentTime: 40, duration: 100, dataset: { mediaSession: '70' }
      };
      el.playerSheet = { hidden: false };
      recoverFromMediaProxyError = async (failure) => suspendedSeekRecoveries.push(failure.driveReason);
      beginMediaSeekIntent(el.videoPlayer, 40, 'fixture');
    })()`);

    clock.advance(5_000);
    run(context, `${suspend};syncMediaSeekWatchdog()`);
    assert.equal(run(context, 'mediaSeekWatchdog.remainingMs'), 10_000, `${label} preserves elapsed active time`);
    assert.equal(clock.scheduled.size, 0, `${label} clears the active timer`);
    clock.advance(60_000);
    assert.equal(run(context, 'suspendedSeekRecoveries.length'), 0, `${label} does not expire while suspended`);

    run(context, `${resume};syncMediaSeekWatchdog()`);
    assert.equal(clock.scheduled.size, 1, `${label} rearms on resume`);
    assert.equal([...clock.scheduled.values()][0].delay, 10_000);
    clock.advance(9_999);
    assert.equal(run(context, 'suspendedSeekRecoveries.length'), 0);
    clock.advance(1);
    await Promise.resolve();
    assert.deepEqual(JSON.parse(run(context, 'JSON.stringify(suspendedSeekRecoveries)')), ['seekNoProgress']);
  }
});

test('source replacement, session replacement, and source clearing make old seek work inert', () => {
  const cases = [
    ['source', 'mediaSourceGeneration+=1;syncMediaSeekWatchdog()'],
    ['session', 'state.mediaSession=82;el.videoPlayer.dataset.mediaSession="82";syncMediaSeekWatchdog()'],
    ['source-clear', 'clearDirectMediaSources()']
  ];

  for (const [label, replace] of cases) {
    const context = loadAppContext();
    const clock = installFakeClock(context);
    run(context, `(() => {
      globalThis.staleSeekCallbacks = [];
      globalThis.staleSeekRecoveries = [];
      state.selected = { id: 'stale-${label}', mimeType: 'video/mp4' };
      state.mediaSession = 81;
      state.playbackSession = 13;
      state.mediaAttempt = 'range';
      state.mediaPlaybackMode = PLAYBACK_MODE.RANGE;
      state.mediaTransportVerified = true;
      state.mediaTransportStarted = true;
      state.mediaDecodeVerified = false;
      el.videoPlayer = {
        hidden: false, paused: false, ended: false, seeking: true,
        currentTime: 25, duration: 100, dataset: { mediaSession: '81' },
        requestVideoFrameCallback(callback) { staleSeekCallbacks.push(callback); return staleSeekCallbacks.length; },
        cancelVideoFrameCallback() {}, pause() {}, removeAttribute() {}, load() {},
        classList: { remove() {} }
      };
      el.playerSheet = { hidden: false };
      recoverFromMediaProxyError = async (failure) => staleSeekRecoveries.push(failure);
      beginMediaSeekIntent(el.videoPlayer, 25, 'fixture');
    })()`);
    const staleTimer = clock.captured[0].callback;

    run(context, replace);
    staleTimer();
    run(context, 'staleSeekCallbacks[0](0, { mediaTime: 25 })');
    assert.equal(run(context, 'mediaSeekWatchdog'), null, `${label} clears the owner`);
    assert.equal(run(context, 'staleSeekRecoveries.length'), 0, `${label} rejects the old timer`);
    assert.equal(run(context, 'state.mediaDecodeVerified'), false, `${label} rejects the old frame`);
  }
});

test('timeupdate remains fallback evidence and never replaces a decoded seek frame', () => {
  const withFrameCallback = loadAppContext();
  installFakeClock(withFrameCallback);
  run(withFrameCallback, `(() => {
    state.selected = { id: 'rvfc-seek', mimeType: 'video/mp4' };
    state.mediaSession = 83;
    state.playbackSession = 14;
    state.mediaAttempt = 'range';
    state.mediaPlaybackMode = PLAYBACK_MODE.RANGE;
    state.mediaTransportVerified = true;
    state.mediaTransportStarted = true;
    el.videoPlayer = {
      hidden: false, paused: false, ended: false, seeking: true,
      currentTime: 60, duration: 100, dataset: { mediaSession: '83' },
      requestVideoFrameCallback() { return 1; }, cancelVideoFrameCallback() {}
    };
    el.playerSheet = { hidden: false };
    globalThis.rvfcSeekGeneration = beginMediaSeekIntent(el.videoPlayer, 60, 'fixture');
    el.videoPlayer.seeking = false;
    state.isSeeking = false;
    noteMediaSeeked(el.videoPlayer, rvfcSeekGeneration);
    onVideoTimeUpdate();
  })()`);
  assert.equal(run(withFrameCallback, 'mediaSeekWatchdog !== null'), true);

  const fallback = loadAppContext();
  installFakeClock(fallback);
  run(fallback, `(() => {
    globalThis.fallbackSeekEvents = [];
    globalThis.__driveOriginalMediaTraceSink = (event) => fallbackSeekEvents.push(event);
    state.selected = { id: 'fallback-seek', mimeType: 'video/mp4' };
    state.mediaSession = 84;
    state.playbackSession = 15;
    state.mediaAttempt = 'range';
    state.mediaPlaybackMode = PLAYBACK_MODE.SEQUENTIAL;
    state.mediaTransportVerified = true;
    state.mediaTransportStarted = true;
    el.videoPlayer = {
      hidden: false, paused: false, ended: false, seeking: true,
      currentTime: 60, duration: 100, dataset: { mediaSession: '84' }
    };
    el.playerSheet = { hidden: false };
    beginMediaDiagnosticTrace(state.selected, 84, mediaDiagnosticTimestamp());
    const generation = beginMediaSeekIntent(el.videoPlayer, 60, 'fixture');
    el.videoPlayer.seeking = false;
    state.isSeeking = false;
    noteMediaSeeked(el.videoPlayer, generation);
    onVideoTimeUpdate();
  })()`);
  assert.equal(run(fallback, 'mediaSeekWatchdog !== null'), true);
  const fallbackCompletions = JSON.parse(run(fallback, `JSON.stringify(
    fallbackSeekEvents.filter((event) => event.stage === 'seek-presentation-fallback')
  )`));
  assert.equal(fallbackCompletions.length, 1);
  assert.equal(fallbackCompletions[0].confidence, 'playback-clock');
  assert.equal(JSON.parse(run(fallback, `JSON.stringify(
    fallbackSeekEvents.filter((event) => event.stage === 'seek-frame')
  )`)).length, 0);

  const zeroFallback = loadAppContext();
  installFakeClock(zeroFallback);
  run(zeroFallback, `(() => {
    state.selected = { id: 'zero-seek', mimeType: 'video/mp4' };
    state.mediaSession = 85;
    state.playbackSession = 16;
    state.mediaAttempt = 'range';
    state.mediaPlaybackMode = PLAYBACK_MODE.SEQUENTIAL;
    state.mediaTransportVerified = true;
    state.mediaTransportStarted = true;
    el.videoPlayer = {
      hidden: false, paused: false, ended: false, seeking: true,
      currentTime: 0, duration: 100, dataset: { mediaSession: '85' }
    };
    el.playerSheet = { hidden: false };
    const generation = beginMediaSeekIntent(el.videoPlayer, 0, 'fixture');
    el.videoPlayer.seeking = false;
    state.isSeeking = false;
    noteMediaSeeked(el.videoPlayer, generation);
    onVideoTimeUpdate();
  })()`);
  assert.equal(
    run(zeroFallback, 'mediaSeekWatchdog !== null'),
    true,
    'zero is valid fallback evidence but not decoded-frame completion'
  );
});

test('frame watchdog suspends for inactive playback and rejects stale timers and frame callbacks', () => {
  const context = loadAppContext();
  const clock = installFakeClock(context);
  run(context, `(() => {
    globalThis.suspendedRecoveries = [];
    globalThis.sampleCallbacks = [];
    state.selected = { id: 'suspend-video', mimeType: 'video/mp4' };
    state.mediaSession = 71;
    state.mediaAttempt = 'range';
    state.mediaPlaybackMode = PLAYBACK_MODE.RANGE;
    state.mediaTransportVerified = true;
    state.mediaTransportStarted = true;
    const video = {
      hidden: false, paused: false, ended: false, seeking: false, currentTime: 0,
      dataset: { mediaSession: '71' },
      requestVideoFrameCallback(callback) { sampleCallbacks.push(callback); return sampleCallbacks.length; },
      cancelVideoFrameCallback() {}
    };
    el.videoPlayer = video;
    el.playerSheet = { hidden: false };
    recoverFromMediaProxyError = async (failure) => { suspendedRecoveries.push(failure.driveReason); };
    syncMediaFrameWatchdog();
    beginVideoFrameSampling();
  })()`);

  const exerciseSuspension = (before, after) => {
    const staleTimer = clock.captured.at(-1).callback;
    run(context, before);
    assert.equal(run(context, 'mediaFrameWatchdog === null'), true);
    staleTimer();
    assert.equal(run(context, 'suspendedRecoveries.length'), 0);
    run(context, after);
    assert.equal(run(context, 'mediaFrameWatchdog !== null'), true);
  };

  exerciseSuspension(
    'el.videoPlayer.paused=true;syncMediaFrameWatchdog()',
    'el.videoPlayer.paused=false;syncMediaFrameWatchdog()'
  );
  exerciseSuspension(
    'document.visibilityState="hidden";syncMediaFrameWatchdog()',
    'document.visibilityState="visible";syncMediaFrameWatchdog()'
  );
  exerciseSuspension(
    'navigator.onLine=false;syncMediaFrameWatchdog()',
    'navigator.onLine=true;syncMediaFrameWatchdog()'
  );
  exerciseSuspension(
    'state.isSeeking=true;el.videoPlayer.seeking=true;syncMediaFrameWatchdog()',
    'state.isSeeking=false;el.videoPlayer.seeking=false;syncMediaFrameWatchdog()'
  );

  run(context, `
    state.mediaDecodeVerified=false;
    state.lastPresentedMediaTime=null;
    mediaSourceGeneration+=1;
    sampleCallbacks[0](0,{mediaTime:1});
  `);
  assert.equal(run(context, 'state.mediaDecodeVerified'), false);
  assert.equal(run(context, 'state.lastPresentedMediaTime'), null);
  run(context, 'syncMediaFrameWatchdog()');
  const staleSessionTimer = clock.captured.at(-1).callback;
  run(context, `
    state.mediaSession=72;
    state.selected={id:'new-video',mimeType:'video/mp4'};
    el.videoPlayer.dataset.mediaSession='72';
    state.mediaDecodeVerified=false;
    state.lastPresentedMediaTime=null;
  `);
  staleSessionTimer();
  assert.equal(run(context, 'suspendedRecoveries.length'), 0);
  assert.equal(run(context, 'mediaFrameWatchdog'), null);
  assert.equal(run(context, 'state.mediaDecodeVerified'), false);
  assert.equal(run(context, 'state.lastPresentedMediaTime'), null);
});

test('buffered-original frame timeout stops locally and leaves compatibility as a user choice', () => {
  const context = loadAppContext();
  const clock = installFakeClock(context);
  run(context, `(() => {
    globalThis.bufferedFailures = [];
    globalThis.bufferedPreviews = 0;
    state.selected = { id: 'buffered-video', mimeType: 'video/mp4' };
    state.mediaSession = 81;
    state.mediaAttempt = 'blob';
    state.mediaPlaybackMode = PLAYBACK_MODE.OPFS;
    state.mediaTransportVerified = true;
    state.mediaTransportStarted = true;
    el.videoPlayer = {
      hidden: false, paused: false, ended: false, seeking: false, currentTime: 12,
      dataset: { mediaSession: '81' }
    };
    el.playerSheet = { hidden: false };
    el.compatPlayerButton = { hidden: true };
    clearDirectMediaSources = () => { clearMediaFrameWatchdog('fixture-source-cleared'); };
    showMediaError = (message, options) => bufferedFailures.push({ message, title: options.title });
    showDrivePreview = () => { bufferedPreviews += 1; };
    syncMediaFrameWatchdog();
  })()`);
  clock.advance(15_000);
  assert.equal(run(context, 'state.mediaAttempt'), 'failed');
  assert.equal(run(context, 'bufferedFailures.length'), 1);
  assert.equal(run(context, 'bufferedPreviews'), 0);
  assert.equal(run(context, 'el.compatPlayerButton.hidden'), false);
});

test('task pool caps concurrency and returns aligned all-settled results', async () => {
  const context = loadAppContext();
  const result = await run(context, `(async () => {
    let active = 0;
    let peak = 0;
    const delays = [30, 5, 20, 1, 10, 15];
    const items = ['a', 'b', 'c', 'd', 'e', 'f'];
    const settled = await runTaskPool(items, async (item, index) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, delays[index]));
      active--;
      if (item === 'd') throw new Error('expected failure');
      return item.toUpperCase();
    }, 4);
    return { peak, settled: settled.map((entry) => ({
      item: entry.item,
      status: entry.status,
      value: entry.value,
      reason: entry.reason && entry.reason.message
    })) };
  })()`);
  const normalized = JSON.parse(JSON.stringify(result));

  assert.ok(normalized.peak <= 4);
  assert.deepEqual(normalized.settled, [
    { item: 'a', status: 'fulfilled', value: 'A' },
    { item: 'b', status: 'fulfilled', value: 'B' },
    { item: 'c', status: 'fulfilled', value: 'C' },
    { item: 'd', status: 'rejected', reason: 'expected failure' },
    { item: 'e', status: 'fulfilled', value: 'E' },
    { item: 'f', status: 'fulfilled', value: 'F' }
  ]);
});

test('Drive view, preview, and media URLs preserve required context', () => {
  const context = loadAppContext();
  const viewUrl = run(context, `buildDriveViewUrl({ id: 'file-id', resourceKey: 'raw-key_1' })`);
  assert.equal(new URL(viewUrl).searchParams.get('resourcekey'), 'raw-key_1');

  const previewUrl = run(context, `buildDrivePreviewUrl({ id: 'file-id', resourceKey: 'raw-key_1' })`);
  assert.equal(new URL(previewUrl).pathname, '/file/d/file-id/preview');
  assert.equal(new URL(previewUrl).searchParams.get('resourcekey'), 'raw-key_1');

  const mediaUrl = run(context, `(() => {
    state.mediaSession = 19;
    return buildMediaUrl({ id: 'file-id', mimeType: 'video/mp4', size: '1000' });
  })()`);
  assert.equal(new URL(mediaUrl).searchParams.get('mediaSession'), '19');
  assert.equal(new URL(mediaUrl).searchParams.get('sourceGeneration'), '0');
  assert.equal(new URL(mediaUrl).searchParams.get('size'), '1000');
});

test('original-first recovery router never downgrades transient failures before retry and buffer recovery', () => {
  const context = loadAppContext();
  const decisions = JSON.parse(run(context, `JSON.stringify({
    auth: decideMediaRecovery({ cause: 'auth' }),
    serverFirst: decideMediaRecovery({ cause: 'server', rangeRetryCount: 0 }),
    serverAfterRetry: decideMediaRecovery({ cause: 'server', rangeRetryCount: 1 }),
    timeoutFirst: decideMediaRecovery({ cause: 'timeout', rangeRetryCount: 0 }),
    timeoutAfterRetry: decideMediaRecovery({ cause: 'timeout', rangeRetryCount: 1 }),
    range416First: decideMediaRecovery({ cause: 'range-416', rangeRetryCount: 0, rangeRebuildCount: 0 }),
    range416AfterRebuild: decideMediaRecovery({ cause: 'range-416', rangeRetryCount: 1, rangeRebuildCount: 1 }),
    permissionFirst: decideMediaRecovery({ cause: 'permission', permissionRetryCount: 0 }),
    permissionExhausted: decideMediaRecovery({ cause: 'permission', permissionRetryCount: 1 }),
    explicitDownloadRestriction: decideMediaRecovery({ cause: 'download-restricted', permissionRetryCount: 1 }),
    unsupported: decideMediaRecovery({ cause: 'unsupported' }),
    restricted: decideMediaRecovery({ cause: 'server', downloadAllowed: false })
  })`));

  assert.equal(decisions.auth, 'refresh-auth');
  assert.equal(decisions.serverFirst, 'retry-range');
  assert.equal(decisions.serverAfterRetry, 'buffer-original');
  assert.equal(decisions.timeoutFirst, 'retry-range');
  assert.equal(decisions.timeoutAfterRetry, 'buffer-original');
  assert.equal(decisions.range416First, 'rebuild-range');
  assert.equal(decisions.range416AfterRebuild, 'buffer-original');
  assert.equal(decisions.permissionFirst, 'refresh-permission');
  assert.equal(decisions.permissionExhausted, 'fail-permission');
  assert.equal(decisions.explicitDownloadRestriction, 'compatibility');
  assert.equal(decisions.unsupported, 'compatibility');
  assert.equal(decisions.restricted, 'compatibility');
});

test('proxy classification preserves structured range and Drive failure causes', () => {
  const context = loadAppContext();
  assert.equal(run(context, "classifyMediaProxyFailure({ status: 416 })"), 'range-416');
  assert.equal(run(context, "classifyMediaProxyFailure({ status: 206, rangeSatisfied: false })"), 'range-invalid');
  assert.equal(run(context, "classifyMediaProxyFailure({ status: 403, driveReason: 'rateLimitExceeded' })"), 'rate-limit');
  assert.equal(run(context, "classifyMediaProxyFailure({ status: 403, driveReason: 'insufficientPermissions' })"), 'permission');
  assert.equal(run(context, "classifyMediaProxyFailure({ status: 403, driveReason: 'fileNotDownloadable' })"), 'download-restricted');
  assert.equal(run(context, "classifyMediaProxyFailure({ status: 504, category: 'timeout', driveReason: 'firstByteTimeout' })"), 'timeout');
  assert.equal(run(context, "classifyMediaProxyFailure({ status: 502 })"), 'server');
  assert.equal(run(context, "parseRetryAfterMs('25')"), 25_000);
  assert.equal(run(context, "parseRetryAfterMs('invalid')"), 0);
  assert.equal(run(context, "getUnsatisfiedRangeSize('bytes */987654')"), 987654);
  assert.equal(run(context, "getUnsatisfiedRangeSize('bytes 0-9/10')"), null);
  assert.equal(run(context, "isLocalOriginalStorageError({ name: 'QuotaExceededError' })"), true);
  assert.equal(run(context, "isLocalOriginalStorageError({ message: 'Original file exceeds temporary storage' })"), true);
  assert.equal(run(context, "isLocalOriginalStorageError({ status: 503, message: 'backend unavailable' })"), false);
});

test('stream timeouts have one app retry owner and block a competing media fallback', async () => {
  const context = loadAppContext();
  const result = JSON.parse(await run(context, `(async () => {
    const results = [];
    const file = {
      id: 'video-timeout', mimeType: 'video/mp4', size: '1000',
      capabilities: { canDownload: true }
    };
    for (const driveReason of ['firstByteTimeout', 'bodyNoProgress']) {
      const calls = [];
      state.selected = file;
      state.mediaSession = 73;
      state.mediaAttempt = 'range';
      state.mediaRetryCount = 0;
      state.lastProxyError = null;
      state.token = 'fixture-token';
      state.expiresAt = Date.now() + 60_000;
      scheduleOriginalStreamRetry = (selected, session, delay) => {
        calls.push({ type: 'range-retry', id: selected.id, session, delay });
        state.mediaAttempt = 'retry-wait';
      };
      offerOriginalBufferFallback = async () => { calls.push({ type: 'buffer' }); };
      showDrivePreview = () => { calls.push({ type: 'preview' }); };
      el.videoPlayer = {
        error: { code: 4 },
        getAttribute(name) { return name === 'src' ? '/__drive_media/video-timeout' : ''; }
      };
      const failure = {
        type: 'MEDIA_PROXY_ERROR', fileId: file.id, sessionId: '73',
        status: 504, category: 'timeout', driveReason
      };
      await handleWorkerMessage({ data: failure });
      await handleWorkerMessage({ data: failure });
      await handleMediaElementError('video');
      results.push({ driveReason, calls, attempt: state.mediaAttempt, lastProxyError: state.lastProxyError });
    }
    return JSON.stringify(results);
  })()`));

  assert.deepEqual(result.map((entry) => entry.calls), [
    [{ type: 'range-retry', id: 'video-timeout', session: 73, delay: 700 }],
    [{ type: 'range-retry', id: 'video-timeout', session: 73, delay: 700 }]
  ]);
  assert.deepEqual(result.map((entry) => entry.attempt), ['retry-wait', 'retry-wait']);
  assert.deepEqual(result.map((entry) => entry.lastProxyError.driveReason), [
    'firstByteTimeout', 'bodyNoProgress'
  ]);
});

test('quality labels remain neutral until original byte delivery is verified', () => {
  const context = loadAppContext();
  assert.equal(run(context, "getPlaybackQualityLabel(PLAYBACK_MODE.RANGE, false)"), '원본 확인 중');
  assert.equal(run(context, "getPlaybackQualityLabel(PLAYBACK_MODE.RANGE, true)"), 'Drive 원본 파일 · Range 무변환 전송');
  assert.equal(run(context, "getPlaybackQualityLabel(PLAYBACK_MODE.SEQUENTIAL, true)"), 'Drive 원본 파일 · 연속 전송');
  assert.equal(run(context, "getPlaybackQualityLabel(PLAYBACK_MODE.OPFS, true)"), 'Drive 원본 파일 · 임시 디스크');
  assert.equal(run(context, "getPlaybackQualityLabel(PLAYBACK_MODE.MEMORY, true)"), 'Drive 원본 파일 · 메모리');
  assert.equal(run(context, "getPlaybackQualityLabel(PLAYBACK_MODE.COMPATIBILITY, false)"), 'Google 호환 재생 · 원본 화질 미확인');
});

test('abuse acknowledgement is opt-in and scoped to the selected file', () => {
  const context = loadAppContext();
  const result = JSON.parse(run(context, `(() => {
    const file = { id: 'flagged', mimeType: 'video/mp4' };
    state.selected = file;
    const beforeProxy = new URL(buildMediaUrl(file)).searchParams.get('acknowledgeAbuse');
    const beforeApi = new URL(buildDriveMediaApiUrl(file)).searchParams.get('acknowledgeAbuse');
    state.mediaAbuseAcknowledged = true;
    const afterProxy = new URL(buildMediaUrl(file)).searchParams.get('acknowledgeAbuse');
    const afterApi = new URL(buildDriveMediaApiUrl(file)).searchParams.get('acknowledgeAbuse');
    const other = new URL(buildDriveMediaApiUrl({ id: 'other' })).searchParams.get('acknowledgeAbuse');
    return JSON.stringify({ beforeProxy, beforeApi, afterProxy, afterApi, other });
  })()`));
  assert.deepEqual(result, {
    beforeProxy: null,
    beforeApi: null,
    afterProxy: '1',
    afterApi: 'true',
    other: null
  });
  assert.equal(run(context, "isDriveSecurityRestriction({ driveReason: 'cannotDownloadAbusiveFile' })"), true);
  assert.equal(run(context, "isDriveSecurityRestriction({ reasons: ['virusDetected'] })"), true);
  assert.equal(run(context, "isDriveSecurityRestriction({ driveReason: 'insufficientPermissions' })"), false);

  const resumedStage = JSON.parse(run(context, `(() => {
    const file = { id: 'flagged', mimeType: 'video/mp4' };
    state.selected = file;
    state.mediaSession = 22;
    state.mediaRetryCount = 1;
    state.pendingSecurityConfirmation = {
      fileId: file.id,
      session: 22,
      sourceGeneration: mediaSourceGeneration,
      stage: 'range'
    };
    el.bufferOriginalButton = { textContent: '' };
    let consumeRetry = null;
    retryOriginalStream = (_file, _session, _message, options) => {
      consumeRetry = options.consumeRetry;
      return true;
    };
    confirmPendingMediaAction();
    return JSON.stringify({ consumeRetry, retryCount: state.mediaRetryCount, acknowledged: state.mediaAbuseAcknowledged });
  })()`));
  assert.deepEqual(resumedStage, { consumeRetry: false, retryCount: 1, acknowledged: true });
});

test('video playback failures distinguish retryable network errors from codec failures', () => {
  const context = loadAppContext();
  assert.match(run(context, 'describeVideoPlaybackFailure(2)'), /스트림 연결/);
  assert.match(run(context, 'describeVideoPlaybackFailure(3)'), /해독/);
  assert.match(run(context, 'describeVideoPlaybackFailure(4)'), /코덱|컨테이너/);
  assert.equal(run(context, `(() => {
    state.mediaPlaybackMode = PLAYBACK_MODE.RANGE;
    state.mediaTransportVerified = false;
    return hasVerifiedOriginalTransport();
  })()`), false);
  assert.equal(run(context, `(() => {
    state.mediaPlaybackMode = PLAYBACK_MODE.RANGE;
    state.mediaTransportVerified = true;
    return hasVerifiedOriginalTransport();
  })()`), true);
  assert.equal(run(context, `(() => {
    state.mediaPlaybackMode = PLAYBACK_MODE.COMPATIBILITY;
    state.mediaTransportVerified = true;
    return hasVerifiedOriginalTransport();
  })()`), false);
  assert.equal(run(context, "decideUnsupportedFormatRecovery({ retryCount: 0, transportVerified: true, playbackMode: PLAYBACK_MODE.RANGE })"), 'retry-range');
  assert.equal(run(context, "decideUnsupportedFormatRecovery({ retryCount: 1, transportVerified: true, playbackMode: PLAYBACK_MODE.RANGE, decodeVerified: false })"), 'compatibility');
  assert.equal(run(context, "decideUnsupportedFormatRecovery({ retryCount: 1, transportVerified: true, playbackMode: PLAYBACK_MODE.RANGE, decodeVerified: true })"), 'buffer-original');
  assert.equal(run(context, "decideUnsupportedFormatRecovery({ retryCount: 1, transportVerified: false, playbackMode: PLAYBACK_MODE.RANGE, decodeVerified: false })"), 'buffer-original');
});

test('full-original recovery retries complete transfer at most three times and rejects partial bodies', async () => {
  const context = loadAppContext();
  const recovered = JSON.parse(await run(context, `(async () => {
    const file = { id: 'full-file', name: 'full.mp4', mimeType: 'video/mp4', size: '3' };
    state.selected = file;
    state.mediaSession = 7;
    let attempts = 0;
    fetchOriginalFileResponse = async () => {
      attempts += 1;
      return { status: 200, headers: new Headers({ 'Content-Length': '3' }), body: { cancel: async () => {} } };
    };
    readResponseIntoBlob = async () => {
      if (attempts < 3) throw new TypeError('stream interrupted');
      return new Blob(['abc'], { type: 'video/mp4' });
    };
    waitForRetry = async () => {};
    const result = await downloadOriginalFile(file, 7, { mode: 'memory', hardLimit: 10 }, new AbortController().signal);
    return JSON.stringify({ attempts, size: result.size, metadataSize: file.size });
  })()`));
  assert.deepEqual(recovered, { attempts: 3, size: 3, metadataSize: '3' });

  const rejected = JSON.parse(await run(context, `(async () => {
    const file = { id: 'partial-file', name: 'partial.mp4', mimeType: 'video/mp4', size: '3' };
    state.selected = file;
    state.mediaSession = 8;
    state.mediaFullRequestCount = 0;
    let attempts = 0;
    let reads = 0;
    let cancels = 0;
    fetchOriginalFileResponse = async () => {
      attempts += 1;
      return {
        status: 200,
        headers: new Headers({ 'Content-Length': '2' }),
        body: { cancel: async () => { cancels += 1; } }
      };
    };
    readResponseIntoBlob = async () => { reads += 1; return new Blob(['ab']); };
    waitForRetry = async () => {};
    let message = '';
    try {
      await downloadOriginalFile(file, 8, { mode: 'memory', hardLimit: 10 }, new AbortController().signal);
    } catch (error) {
      message = error.message;
    }
    return JSON.stringify({ attempts, reads, cancels, metadataSize: file.size, message });
  })()`));
  assert.deepEqual(rejected, {
    attempts: 3,
    reads: 0,
    cancels: 3,
    metadataSize: '3',
    message: 'Original Content-Length mismatch (2/3)'
  });

  const sharedBudget = JSON.parse(await run(context, `(async () => {
    const file = { id: 'shared-budget', name: 'shared.mp4', mimeType: 'video/mp4', size: '3' };
    state.selected = file;
    state.mediaSession = 9;
    state.mediaFullRequestCount = 0;
    let requests = 0;
    fetchOriginalFileResponse = async () => {
      requests += 1;
      return { status: 200, headers: new Headers({ 'Content-Length': '3' }), body: { cancel: async () => {} } };
    };
    writeResponseIntoOpfs = async () => { throw new DOMException('quota full', 'QuotaExceededError'); };
    readResponseIntoBlob = async () => { throw new TypeError('stream interrupted'); };
    waitForRetry = async () => {};
    try {
      await downloadOriginalFile(file, 9, { mode: 'disk', hardLimit: 10 }, new AbortController().signal);
    } catch (_) {}
    try {
      await downloadOriginalFile(file, 9, { mode: 'memory', hardLimit: 10 }, new AbortController().signal);
    } catch (_) {}
    return JSON.stringify({ requests, count: state.mediaFullRequestCount });
  })()`));
  assert.deepEqual(sharedBudget, { requests: 3, count: 3 });
});

test('full-original permission failure refreshes once in-app before requiring reconnection', async () => {
  const context = loadAppContext();
  context.console = { error() {}, warn() {}, log() {} };
  const result = JSON.parse(await run(context, `(async () => {
    const file = { id: 'permission-file', name: 'permission.jpg', mimeType: 'image/jpeg', size: '3' };
    state.selected = file;
    state.mediaSession = 12;
    state.mediaPermissionRetryCount = 0;
    let downloads = 0;
    let refreshes = 0;
    let cleared = 0;
    requestSessionCredential = async () => { refreshes += 1; return true; };
    clearToken = () => { cleared += 1; };
    updateQualityDisplay = () => {};
    clearDirectMediaSources = () => {};
    showMediaLoading = () => {};
    cleanupOriginalTempStorage = () => {};
    URL.createObjectURL = () => 'blob:test-original';
    el.codecNote = { textContent: '' };
    el.imageViewer = { hidden: true, dataset: {}, alt: '', src: '' };
    downloadOriginalFile = async () => {
      downloads += 1;
      if (downloads === 1) {
        const error = new Error('permission');
        error.status = 403;
        error.reasons = ['insufficientPermissions'];
        error.driveReason = 'insufficientPermissions';
        throw error;
      }
      return new Blob(['abc'], { type: 'image/jpeg' });
    };
    await startOriginalBlobFallback(file, 'image', 12, {
      confirmed: true,
      policy: { decision: 'auto', mode: 'memory', hardLimit: 10 }
    });
    return JSON.stringify({
      downloads,
      refreshes,
      cleared,
      permissionRetries: state.mediaPermissionRetryCount,
      attempt: state.mediaAttempt,
      src: el.imageViewer.src
    });
  })()`));
  assert.deepEqual(result, {
    downloads: 2,
    refreshes: 1,
    cleared: 0,
    permissionRetries: 1,
    attempt: 'blob',
    src: 'blob:test-original'
  });
});

test('folder strip rendering obeys its hard cap', () => {
  const context = loadAppContext();
  installMiniDom(context);
  const grid = context.document.createElement('div');
  const strip = context.document.createElement('div');
  context.testGrid = grid;
  context.testStrip = strip;
  const count = JSON.parse(run(context, `(() => {
    el.fileGrid = testGrid;
    el.folderStrip = testStrip;
    el.emptyState = {};
    el.librarySummary = {};
    renderBreadcrumb = () => {};
    updateLibrarySummary = () => {};
    state.files = [];
    state.folders = Array.from({ length: FOLDER_RENDER_MAX + 100 }, (_, index) => ({ id: 'folder-' + index, name: 'Folder ' + index }));
    state.filter = 'all';
    state.query = '';
    renderFiles({ resetWindow: true });
    return JSON.stringify({ rendered: testStrip.children.length, max: FOLDER_RENDER_MAX });
  })()`));
  assert.equal(count.rendered, count.max);
});

test('bulk move eligibility skips current items but blocks any non-current permission failure', () => {
  const context = loadAppContext();
  const target = { id: 'target', driveId: null, capabilities: { canAddChildren: true } };

  assert.equal(run(context, `getBulkMoveBlockReason([
    { id: 'already-there', parents: ['target'], capabilities: {} },
    { id: 'movable', parents: ['source'], capabilities: {} }
  ], ${JSON.stringify(target)})`), null, 'one actionable item keeps the bulk move available');

  assert.equal(run(context, `getBulkMoveBlockReason([
    { id: 'first', parents: ['target'], capabilities: {} },
    { id: 'second', parents: ['target'], capabilities: {} }
  ], ${JSON.stringify(target)})`), '현재 위치');

  assert.equal(run(context, `getBulkMoveBlockReason([
    { id: 'already-there', parents: ['target'], capabilities: {} },
    { id: 'blocked', parents: ['source'], capabilities: { canMoveItemWithinDrive: false } }
  ], ${JSON.stringify(target)})`), '이동 권한 없음');

  assert.equal(run(context, `getBulkMoveBlockReason([
    { id: 'shared-file', parents: ['source'], driveId: 'shared-a', capabilities: { canMoveItemOutOfDrive: false } }
  ], ${JSON.stringify(target)})`), '드라이브 간 이동 불가');
});

test('bulk action target text is stable for empty, single, and multi-file selections', () => {
  const context = loadAppContext();
  assert.equal(run(context, 'formatActionTarget([])'), '이름 없는 파일');
  assert.equal(run(context, "formatActionTarget([{ id: 'one', name: 'one.mp4' }])"), 'one.mp4');
  assert.equal(run(context, "formatActionTarget([{ id: 'one', name: 'one.mp4' }, { id: 'two', name: 'two.jpg' }, { id: 'three', name: 'three.png' }])"), '3개 파일 · one.mp4 외 2개');
});

test('clearing a pending session credential request aborts it and permits a new generation', async () => {
  const context = loadAppContext();
  let starts = 0; const signals = [];
  context.fetch = async (_url, options) => {
    starts += 1;
    signals.push(options.signal);
    return new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
    });
  };
  run(context, `el.connectionBadge={dataset:{},querySelector(){return null}};el.authHint={textContent:'',classList:{add(){},remove(){}}};`);
  const first = run(context, 'requestSessionCredential({background:true,force:true})');
  assert.equal(starts, 1);
  run(context, 'clearToken(false)');
  assert.equal(signals[0].aborted, true);
  const second = run(context, 'requestSessionCredential({background:true,force:true})');
  assert.equal(starts, 2);
  run(context, 'credentialRequestAbortController?.abort()');
  assert.deepEqual(await Promise.all([first, second]), [false, false]);
});

test('Q1 retirement hides no pending cleanup and carries failure across later owners', async () => {
  const context = loadAppContext();
  const first = run(context, `
    let finishSetup,finishCleanup,aborts=0,disposals=0;
    const cleanup=new Promise(resolve=>{finishCleanup=resolve});
    const owner={controller:{abort(){aborts++}},setupDone:new Promise(resolve=>{finishSetup=resolve}),
      player:{dispose(){disposals++;return cleanup}}};
    retireQ1Playback(owner);
  `);
  assert.equal(run(context,'aborts'),1);assert.equal(run(context,'disposals'),1);
  assert.equal(run(context,'retireQ1Playback(owner)'),first);
  let settled=false;first.then(()=>{settled=true;});
  run(context,'finishSetup()');await Promise.resolve();assert.equal(settled,false);
  run(context,'finishCleanup({settled:false})');assert.equal((await first).settled,false);
  const second=run(context,'retireQ1Playback({controller:{abort(){}},setupDone:Promise.resolve(),player:{dispose(){return Promise.resolve({settled:true})}}})');
  assert.equal((await second).settled,false);
});

test('Q1 worker retirement requires a matching live controller reply and closes every port/listener', async () => {
  for (const outcome of ['ok','denied','wrong-id','wrong-generation','replaced','timeout','missing']) {
    const context=loadAppContext(),clock=installFakeClock(context),channels=[],listeners=new Set();
    context.MessageChannel=class {
      constructor(){this.port1={close(){this.closed=true}};this.port2={close(){this.closed=true}};channels.push(this);}
    };
    let request;
    const controller={postMessage(data){request=data}};
    const serviceWorker={controller:outcome==='missing'?null:controller,
      addEventListener(_name,fn){listeners.add(fn)},removeEventListener(_name,fn){listeners.delete(fn)}};
    context.navigator.serviceWorker=serviceWorker;context.owner={swController:controller,swGeneration:8};
    const pending=run(context,'confirmQ1WorkerRetirement(owner)');
    if(outcome==='missing'){assert.equal(await pending,false);assert.equal(channels.length,0);continue;}
    const handler=channels[0].port1.onmessage;
    const reply={type:'Q1_RETIRE_RESPONSE',protocol:'drive-original-q1-retirement-v1',
      requestId:request.requestId,retiredThroughGeneration:8,settled:true};
    if(outcome==='replaced'){serviceWorker.controller={};for(const listener of [...listeners])listener();}
    else if(outcome==='timeout')clock.advance(2000);
    else {if(outcome==='denied')reply.settled=false;if(outcome==='wrong-id')reply.requestId='other';
      if(outcome==='wrong-generation')reply.retiredThroughGeneration=9;handler({data:reply});}
    assert.equal(await pending,outcome==='ok');
    handler({data:{...reply,requestId:request.requestId,retiredThroughGeneration:8,settled:true}});
    assert.ok(channels[0].port1.closed&&channels[0].port2.closed);
    assert.equal(channels[0].port1.onmessage,null);assert.equal(channels[0].port1.onmessageerror,null);
    assert.equal(listeners.size,0);assert.equal(clock.scheduled.size,0);
  }
});

test('native-only initial startup assigns its source synchronously before immediate play', async () => {
  const context=loadAppContext();
  run(context,`const file={id:'native',size:'941'};state.selected=file;state.mediaSession=1;
    let assigned=false,played=false;startOriginalRangePlayback=()=>{assigned=true};
    const video={play(){if(!assigned)throw new Error('late load would abort play');played=true}};`);
  const pending=run(context,"startInitialOriginalPlayback(file,'video',1)");
  run(context,'video.play()');assert.equal(run(context,'played'),true);await pending;
});

test('a native sniff fallback retirement reply cannot mutate a later file, session, account or source', async () => {
  const app=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
  const fallback=app.slice(app.indexOf('  const resumeNative = async () => {'),app.indexOf('  const stopFailure = code => {'));
  for(const settled of [true,false])for(const change of ['none','file','session','account','source','route','owner']){
    const context=loadAppContext();context.retired={settled};
    run(context,`let finish,shown=0;const file={id:'one'},session=4,account='A',accountGeneration=2,oldAttempt='native';
      const controller=new AbortController(),owner={};const setupFinished=()=>{};
      state.selected=file;state.mediaSession=session;state.authAccountKey=account;state.driveSessionGeneration=accountGeneration;
      state.mediaAttempt='q1-probing';q1Playback=owner;state.mediaAbortController=controller;
      retireQ1Playback=()=>new Promise(resolve=>finish=resolve);showMediaError=()=>shown++;
      ${fallback}`);
    const pending=run(context,'resumeNative()');
    if(change==='file')run(context,"state.selected={id:'later'}");
    if(change==='session')run(context,'state.mediaSession++');
    if(change==='account')run(context,'state.driveSessionGeneration++');
    if(change==='source')run(context,'mediaSourceGeneration++');
    if(change==='route')run(context,'initialMediaRouteGeneration++');
    if(change==='owner')run(context,'q1Playback={}');
    run(context,'finish(retired)');await pending;
    assert.equal(run(context,'state.mediaAttempt'),change==='none'?(settled?'native':'failed'):'q1-probing');
    assert.equal(run(context,'shown'),change==='none'&&!settled?1:0);
  }
});

test('native unsupported container keeps requested play intent but gesture denial clears it', async () => {
  const context = loadAppContext();context.console={warn(){}};
  run(context,`state.mediaSession=9;state.pendingPlay=true;
    el.videoPlayer={hidden:false,paused:true,currentTime:0,play:()=>Promise.reject(new DOMException('unsupported','NotSupportedError'))};
    showPlayerFeedback=()=>{};updatePlayPauseUI=()=>{};syncMediaSeekWatchdog=()=>{};clearMediaFrameWatchdog=()=>{};`);
  await run(context,'attemptCurrentPlayback(9)');assert.equal(run(context,'state.pendingPlay'),true);
  assert.equal(run(context,'capturePlaybackSnapshot().paused'),false);
  run(context,`el.videoPlayer.play=()=>Promise.reject(new DOMException('gesture','NotAllowedError'));`);
  await run(context,'attemptCurrentPlayback(9)');assert.equal(run(context,'state.pendingPlay'),false);
  assert.equal(run(context,'capturePlaybackSnapshot().paused'),true);
});

function installMediaResetFixture(context) {
  run(context, `
    const resetNode=()=>({hidden:false,dataset:{},classList:{remove(){}},
      removeAttribute(name){delete this[name]},getAttribute(name){return this[name]??null}});
    el.videoPlayer={...resetNode(),paused:true,currentTime:0,duration:100,
      pause(){this.paused=true},load(){},addEventListener(_name,callback){globalThis.oldMetadataCallback=callback}};
    el.imageViewer=resetNode();el.playerSheet={hidden:false};
    for(const name of ['mediaError','openDriveButton','retryMediaButton','bufferOriginalButton',
      'compatPlayerButton','mediaLoading','mediaLoadingText'])el[name]=resetNode();
    document.body={style:{overflow:'hidden'}};
    cancelLibraryEdgeBack=()=>{};hasOwnedPlayerEntry=()=>false;clearMediaTransition=()=>{};
    setPlayerMediaPriorityActive=()=>{};collapseShortsExpand=()=>{};resetVideoRotation=()=>{};
    setStageImmersive=()=>{};setPlayerBackgroundInert=()=>{};
  `);
}

test('closing a failed source resets pending play and fences late restore callbacks', async () => {
  const context=loadAppContext();installMediaResetFixture(context);
  run(context, `
    state.selected={id:'failed',mimeType:'video/mp2t'};state.mediaSession=9;
    state.mediaAttempt='failed';state.pendingPlay=true;mediaSourceGeneration=4;
    el.videoPlayer.dataset.mediaSession='9';el.videoPlayer.src='blob:failed';
    let disposed=0;const failedController=new AbortController();
    q1Playback={controller:failedController,setupDone:Promise.resolve(),
      player:{dispose(){disposed++;return Promise.resolve({settled:true})}}};
    q0PinnedSource={};verifiedOriginalImage={};
    restorePlaybackSnapshot(el.videoPlayer,{time:6,paused:false,volume:1,muted:true,playbackRate:1},9);
    closePlayer();
  `);
  assert.equal(run(context,'state.pendingPlay'),false);
  assert.equal(run(context,'state.selected'),null);assert.equal(run(context,'state.mediaAttempt'),'idle');
  assert.equal(run(context,'state.mediaSession'),10);assert.equal(run(context,'mediaSourceGeneration'),5);
  assert.equal(run(context,'q0Playback'),null);assert.equal(run(context,'q1Playback'),null);
  assert.equal(run(context,'q0PinnedSource'),null);assert.equal(run(context,'verifiedOriginalImage'),null);
  assert.equal(run(context,'failedController.signal.aborted'),true);assert.equal(run(context,'disposed'),1);
  assert.equal(run(context,'el.videoPlayer.getAttribute("src")'),null);
  assert.equal((await run(context,'q1Retirement')).settled,true);
  run(context,'oldMetadataCallback()');
  assert.equal(run(context,'state.pendingPlay'),false,'closed session cannot regain autoplay intent from late metadata');
});

test('source-only handoff retains play intent while full reset revokes it', () => {
  const context=loadAppContext();installMediaResetFixture(context);
  run(context, 'state.pendingPlay=true;clearDirectMediaSources()');
  assert.equal(run(context,'state.pendingPlay'),true,'unsupported Q0 to Q1 handoff retains the requested intent');
  run(context,'resetMediaElements()');
  assert.equal(run(context,'state.pendingPlay'),false);
});

test('opening a replacement preserves requested video intent after reset and clears it for images', () => {
  for(const [mimeType,requested,expected] of [['video/mp4',true,true],['video/mp4',false,false],['image/png',true,false]]) {
    const context=loadAppContext();installMediaResetFixture(context);
    run(context, `
      refreshFavoritePresentation=()=>{};getPlaybackFileList=()=>[];buildAccountPlaybackDeck=()=>({});
      hasCompletePlaybackPopulation=()=>false;warmPlaybackNeighborhood=()=>{};
      beginMediaViewObservation=()=>{};beginMediaDiagnosticTrace=()=>{};emitMediaDiagnosticStage=()=>{};
      updateQualityDisplay=()=>{};showMediaLoading=()=>{};hasUsableToken=()=>true;
      state.pendingPlay=${requested};let routeIntent=null,routeSession=null;
      startInitialOriginalPlayback=(_file,_kind,session)=>{routeIntent=state.pendingPlay;routeSession=session};
      openMediaSource({id:'replacement',mimeType:${JSON.stringify(mimeType)}});
    `);
    assert.equal(run(context,'routeIntent'),expected,`${mimeType} requested=${requested}`);
    assert.equal(run(context,'routeSession===state.mediaSession'),true,'intent reaches the new session before route selection');
    assert.equal(run(context,'state.pendingPlay'),expected);
  }
});

test('native restore callback cannot reposition a later Q1 source in the same session', () => {
  const context=loadAppContext();
  run(context,`let restored=0,metadataCallback;
    state.mediaSession=1;state.selected={id:'one'};mediaSourceGeneration=1;
    isCurrentMediaEvent=()=>true;setPlayerCurrentTime=()=>{restored++};
    const video={addEventListener(_name,fn){metadataCallback=fn}};
    restorePlaybackSnapshot(video,{time:6.1,paused:true,volume:1,muted:true,playbackRate:1},1);
    mediaSourceGeneration=2;metadataCallback();`);
  assert.equal(run(context,'restored'),0);
});

test('early TS eligibility is a bounded hint and preserves native capability and unknown-size paths', () => {
  const context=loadAppContext();context.MediaSource=function(){};context.Worker=function(){};
  run(context,`el.videoPlayer={canPlayType:()=>''};`);
  assert.equal(run(context,"shouldProbeOriginalTs({size:'940'},'video')"),true);
  for(const size of ['939','941','0','-188','invalid','9007199254740992',undefined]){
    context.sampleSize=size;
    assert.equal(run(context,"shouldProbeOriginalTs({size:sampleSize},'video')"),false);
  }
  assert.equal(run(context,"shouldProbeOriginalTs({size:'940'},'image')"),false);
  run(context,"el.videoPlayer.canPlayType=()=> 'maybe'");
  assert.equal(run(context,"shouldProbeOriginalTs({size:'940'},'video')"),false);
  run(context,"el.videoPlayer.canPlayType=()=>{throw new Error()}");
  assert.equal(run(context,"shouldProbeOriginalTs({size:'940'},'video')"),false);
});

test('early TS route chooses Q1 or Q0 only after the owned probe result', async () => {
  for(const admitted of [true,false]){
    const context=loadAppContext();context.MediaSource=function(){};context.Worker=function(){};
    context.admitted=admitted;
    const result=await run(context,`(async()=>{
      let calls=[];const file={id:'test',size:'940'};state.selected=file;state.mediaSession=1;
      el.videoPlayer={canPlayType:()=>''};showMediaLoading=()=>{};sendTokenToWorker=()=>{};
      tryOriginalTsPlayback=async(_file,_session,options)=>{calls.push('probe:'+options.initial);return admitted};
      startOriginalRangePlayback=()=>calls.push('native');
      await startInitialOriginalPlayback(file,'video',1);return JSON.stringify(calls);
    })()`);
    assert.deepEqual(JSON.parse(result),admitted?['probe:true']:['probe:true','native']);
  }
});

test('initial native replacement waits for Q1 retirement and rejects failed or stale cleanup', async () => {
  for(const outcome of ['clean','failed','stale']){
    const context=loadAppContext();
    run(context,`let finish,calls=[];const file={id:'test',size:'941'};state.selected=file;state.mediaSession=1;
      q1Retirement=new Promise(resolve=>{finish=resolve});q1RetirementResult=null;startOriginalRangePlayback=()=>calls.push('native');
      showMediaError=()=>calls.push('blocked');`);
    const request=run(context,"startInitialOriginalPlayback(file,'video',1)");
    await Promise.resolve();assert.equal(run(context,'calls.length'),0);
    if(outcome==='stale')run(context,'state.mediaSession++');
    run(context,`finish({settled:${outcome!=='failed'}})`);await request;
    assert.deepEqual(JSON.parse(run(context,'JSON.stringify(calls)')),outcome==='clean'?['native']:outcome==='failed'?['blocked']:[]);
  }
});

test('a stale early probe cannot assign native after an account change', async () => {
  const context=loadAppContext();context.MediaSource=function(){};context.Worker=function(){};
  run(context,`let calls=0;const file={id:'test',size:'940'};state.selected=file;state.mediaSession=1;
    el.videoPlayer={canPlayType:()=>''};showMediaLoading=()=>{};sendTokenToWorker=()=>{};
    tryOriginalTsPlayback=async()=>{state.driveSessionGeneration++;return false};startOriginalRangePlayback=()=>calls++;`);
  await run(context,"startInitialOriginalPlayback(file,'video',1)");assert.equal(run(context,'calls'),0);
});

test('same-session initial calls have one route owner and cannot bypass an active probe cleanup', async () => {
  const context=loadAppContext();
  run(context,`let finishSetup,finishCleanup,calls=0,aborted=0;const file={id:'test',size:'941'};
    state.selected=file;state.mediaSession=1;startOriginalRangePlayback=()=>calls++;showMediaError=()=>{};
    q1Playback={controller:{abort(){aborted++}},setupDone:new Promise(resolve=>finishSetup=resolve),
      player:{dispose(){return new Promise(resolve=>finishCleanup=resolve)}}};`);
  const first=run(context,"startInitialOriginalPlayback(file,'video',1)");
  const second=run(context,"startInitialOriginalPlayback(file,'video',1)");
  await Promise.resolve();assert.equal(run(context,'aborted'),1);assert.equal(run(context,'calls'),0);
  run(context,'finishSetup();finishCleanup({settled:true})');await Promise.all([first,second]);
  assert.equal(run(context,'calls'),1);
});


test('AUTH-05 missing appData preserves playback and local pending state while allowing Drive reads', async () => {
  const context = loadAppContext();
  let calls = 0;
  context.fetch = async () => { calls++; return new Response('{}'); };
  run(context, `
    state.token='old';state.expiresAt=Date.now()+3600000;state.authAccountKey='account-A';state.tokenRevision=1;
    state.accountId='permission-A';state.accountStateLoaded=true;state.accountIdentityPending=false;
    state.accountMediaState={version:1,viewed:{file:123},favorites:{},updatedAt:123};
    state.accountStateRevision=7;state.selected={id:'file'};state.mediaSession=9;state.playbackSession=10;
    state.accountStateAbortController=new AbortController();
    globalThis.previousStateController=state.accountStateAbortController;
    el.connectionBadge={dataset:{},querySelector(){return null}};
    el.authHint={textContent:'',classList:{add(){},remove(){}}};
    scheduleTokenRenewal=()=>{};resumeAfterCredential=()=>{};sendTokenToWorker=()=>{};
  `);
  assert.equal(run(context, `installSessionCredential({accessToken:'partial',expiresAt:Date.now()+3600000,
    account:'account-A',revision:2,capabilities:{version:1,driveRead:true,driveWrite:true,appData:false}},
    {generation:state.authGeneration})`), true);
  assert.deepEqual(JSON.parse(run(context, `JSON.stringify({token:state.token,viewed:state.accountMediaState.viewed,
    revision:state.accountStateRevision,selected:state.selected.id,media:state.mediaSession,playback:state.playbackSession,
    aborted:previousStateController.signal.aborted,loaded:state.accountStateLoaded})`)),
    {token:'partial',viewed:{file:123},revision:7,selected:'file',media:9,playback:10,aborted:true,loaded:false});
  await run(context, `driveFetch('https://www.googleapis.com/drive/v3/files/file?alt=media')`);
  assert.equal(calls, 1);
  await assert.rejects(run(context, `readAccountStateFile('state-file')`), error => error.code === 'insufficient_scope' && error.feature === 'appData');
  await run(context, 'flushAccountMediaState()');
  run(context, 'queueAccountStateSync()');
  assert.equal(calls, 1);
  assert.equal(run(context, 'state.accountStateSyncTimer'), null);
  assert.equal(run(context, `canRefreshAccountState()`), false);
});

test('AUTH-05 appData-only grants can read state but cannot read ordinary files or authorize old credentials', async () => {
  const context = loadAppContext();
  let calls = 0;
  context.fetch = async () => { calls++; return new Response(JSON.stringify({schemaVersion:2,writerId:'fixture',viewed:{},favorites:{},updatedAt:0})); };
  run(context, `state.token='partial';state.expiresAt=Date.now()+3600000;
    state.authCapabilities={version:1,driveRead:false,driveWrite:false,appData:true};`);
  await run(context, `driveFetch('https://www.googleapis.com/drive/v3/about?fields=user(permissionId)')`);
  await run(context, `driveFetch('https://www.googleapis.com/drive/v3/files/state-file?alt=media',{[ACCOUNT_STATE_READ]:true})`);
  assert.equal(calls, 2);
  await assert.rejects(run(context, `driveFetch('https://www.googleapis.com/drive/v3/files/media?alt=media')`), error => error.feature === 'driveRead');
  assert.equal(calls, 2);
  assert.equal(run(context, `normalizeSessionCredential({accessToken:'legacy',expiresAt:Date.now()+3600000,account:'A',revision:1})`), null);
  assert.equal(run(context, `normalizeAuthCapabilities({version:99,driveRead:true,driveWrite:true,appData:true})`), null);
  run(context, `state.authCapabilities={version:1,driveRead:true,driveWrite:false,appData:true};`);
  await assert.rejects(run(context, `driveFetch('https://www.googleapis.com/drive/v3/files/media',{method:'PATCH'})`), error => error.feature === 'driveWrite');
  assert.equal(calls, 2);
});


test('AUTH-05 ordinary media worker receives no token without Drive read capability', async () => {
  const context = loadAppContext();
  const messages = [];
  context.navigator.serviceWorker = { controller: { postMessage: message => messages.push(message) } };
  context.port = { postMessage: message => messages.push(message), close() {} };
  run(context, `state.token='appData-only';state.expiresAt=Date.now()+3600000;state.authAccountKey='A';state.tokenRevision=4;
    state.authCapabilities={version:1,driveRead:false,driveWrite:false,appData:true};sendTokenToWorker();`);
  assert.equal(messages[0].type, 'CLEAR_TOKEN');
  assert.equal(Object.hasOwn(messages[0], 'token'), false);
  await run(context, `handleWorkerMessage({data:{type:'TOKEN_REQUEST',requestId:'r',accountGeneration:state.driveSessionGeneration,
    expectedAccount:'A'},ports:[port]})`);
  assert.equal(messages.at(-1).type, 'TOKEN_RESPONSE');
  assert.equal(messages.at(-1).token, null);
  assert.equal(run(context, 'state.token'), 'appData-only');
});

function installPausedPresentationFixture(context) {
  run(context, `(() => {
    globalThis.seekPresentationFrames = [];
    const classes = new Set(['has-poster']);
    state.selected = { id:'paused-target', mimeType:'video/mp4' };
    state.mediaSession=81;state.playbackSession=4;state.accountId='account';
    state.authAccountKey='account-key';state.driveSessionGeneration=3;
    state.mediaAttempt='q1';state.mediaPlaybackMode=PLAYBACK_MODE.REPACKAGED;
    state.mediaTransportVerified=true;state.mediaTransportStarted=true;
    mediaSourceGeneration=10;mediaSeekGeneration=0;
    el.videoPlayer={hidden:false,paused:true,ended:false,seeking:true,currentTime:50,duration:100,
      dataset:{mediaSession:'81'},hasPoster:true,
      classList:{add(name){classes.add(name)},remove(name){classes.delete(name)},contains(name){return classes.has(name)}},
      removeAttribute(name){if(name==='poster')this.hasPoster=false},
      requestVideoFrameCallback(fn){seekPresentationFrames.push(fn);return seekPresentationFrames.length},cancelVideoFrameCallback(){}};
    el.playerSheet={hidden:false};el.mediaLoading={hidden:true};el.mediaLoadingText={};el.mediaError={hidden:true};
    updateQualityDisplay=()=>{};tryCaptureAmbientFrame=()=>{};hideSwipeNeighbor=()=>{};
    beginMediaSeekIntent(el.videoPlayer,50,'paused-ordering');
    showMediaLoading('owned seek loading');
  })()`);
}

test('paused decoded target before late presentation registration clears loading only after seeked and reuses proof', () => {
  const context=loadAppContext();installFakeClock(context);installPausedPresentationFixture(context);
  run(context,'seekPresentationFrames[0](0,{mediaTime:50});');
  assert.equal(run(context,'mediaSeekWatchdog.frameSeen'),true);
  assert.equal(run(context,'el.mediaLoading.hidden'),false,'target while seeking cannot complete presentation early');
  run(context,'el.videoPlayer.seeking=false;handleVideoSeeked({currentTarget:el.videoPlayer});');
  assert.equal(run(context,'mediaSeekWatchdog'),null);
  assert.equal(run(context,'el.mediaLoading.hidden'),true,'settled owned decoded seek does not need another paused frame');
  assert.equal(run(context,'el.videoPlayer.hasPoster'),false);
  const count=run(context,'seekPresentationFrames.length');
  run(context,"showMediaLoading('late ready ordering');onMediaReady();");
  assert.equal(run(context,'el.mediaLoading.hidden'),true,'late ready path reuses the completed target proof');
  assert.equal(run(context,'seekPresentationFrames.length'),count,'late registration must not wait on a nonexistent paused frame');
  assert.equal(run(context,'el.videoPlayer.dataset.presentationSession'),undefined);
});

test('paused presentation rejects paint-only and stale-source target proof', () => {
  for(const stale of [false,true]){
    const context=loadAppContext();installFakeClock(context);installPausedPresentationFixture(context);
    if(stale)run(context,'mediaSourceGeneration+=1;');
    run(context,`noteMediaFrameProgress(el.videoPlayer,50,'${stale?'decoded-frame':'paint-only'}',10,mediaSeekGeneration,'q1');el.videoPlayer.seeking=false;handleVideoSeeked({currentTarget:el.videoPlayer});`);
    assert.equal(run(context,'el.mediaLoading.hidden'),false,'unqualified progress cannot dismiss loading');
  }
});

test('completed paused presentation is fenced by account/source/attempt and cleared with seek retirement', () => {
  for(const change of ["state.authAccountKey='replacement';","mediaSourceGeneration+=1;","state.mediaAttempt='range';","clearMediaSeekWatchdog('source-cleared');"]){
    const context=loadAppContext();installFakeClock(context);installPausedPresentationFixture(context);
    run(context,'seekPresentationFrames[0](0,{mediaTime:50});el.videoPlayer.seeking=false;handleVideoSeeked({currentTarget:el.videoPlayer});');
    run(context,change+"showMediaLoading('replacement loading');onMediaReady();");
    assert.equal(run(context,'el.mediaLoading.hidden'),false,'retired owner cannot hide replacement loading');
    assert.equal(run(context,'completedMediaSeekPresentation'),null,'stale or retired proof is released');
  }
});


test('ordinary and sampler paused target callbacks keep loading until owned seeked settlement', () => {
  for (const order of [[0, 1], [1, 0]]) {
    const context = loadAppContext(); installFakeClock(context); installPausedPresentationFixture(context);
    run(context, 'scheduleVideoFramePresentation(el.videoPlayer,state.mediaSession);');
    const pendingKey = run(context, 'el.videoPlayer.dataset.presentationSession');
    for (const index of order) run(context, `seekPresentationFrames[${index}](0,{mediaTime:50});`);
    assert.equal(run(context, 'mediaSeekWatchdog.frameSeen'), true);
    assert.equal(run(context, 'mediaSeekWatchdog.seekedSeen'), false);
    assert.equal(run(context, 'state.isSeeking && el.videoPlayer.seeking'), true);
    assert.equal(run(context, 'el.mediaLoading.hidden'), false, 'ordinary callback cannot reveal before seeked');
    assert.equal(run(context, 'el.videoPlayer.dataset.presentationSession'), pendingKey, 'waiting seek retains current presentation key');
    const count = run(context, 'seekPresentationFrames.length');
    run(context, 'el.videoPlayer.seeking=false;handleVideoSeeked({currentTarget:el.videoPlayer});');
    assert.equal(run(context, 'mediaSeekWatchdog'), null);
    assert.equal(run(context, 'el.mediaLoading.hidden'), true, 'seeked joins the existing decoded proof without another frame');
    assert.equal(run(context, 'el.videoPlayer.dataset.presentationSession'), undefined);
    assert.equal(run(context, 'seekPresentationFrames.length'), count);
  }
});


test('WebP cards freeze thumbnails without widening GIF semantics or changing native still-image cards', () => {
  const context = loadAppContext();
  const { findNodes } = installMiniDom(context);
  context.cardFiles = [
    { id: 'webp-mime', name: 'animation.bin', mimeType: 'image/webp' },
    { id: 'webp-extension', name: 'ANIMATION.WebP', mimeType: 'image/jpeg' },
    { id: 'gif-control', name: 'animation.gif', mimeType: 'image/gif' },
    { id: 'png-control', name: 'still.png', mimeType: 'image/png' },
    { id: 'bmp-control', name: 'still.bmp', mimeType: 'image/bmp' }
  ].map(file => ({ ...file, size: '100', thumbnailLink: 'https://example.test/' + file.id, capabilities: { canDownload: true } }));
  context.cardResults = run(context, 'cardFiles.map(file => createFileCard(file, 0))');
  for (let index = 0; index < context.cardFiles.length; index++) {
    const file = context.cardFiles[index], card = context.cardResults[index];
    const canvases = findNodes(card, 'canvas'), images = findNodes(card, 'img');
    const frozen = index < 3;
    assert.equal(canvases.length, frozen ? 1 : 0, file.id + ' static thumbnail choice');
    assert.equal(images.length, frozen ? 0 : 1, file.id + ' native animated image must not mount for frozen cards');
    if (frozen) {
      assert.equal(canvases[0].width, 1, 'idle canvas keeps bounded placeholder backing store');
      context.cardCanvas = canvases[0];
      assert.equal(run(context, 'gifThumbnailEntries.get(cardCanvas)?.file.id'), file.id, 'existing static loader owns the card');
      const label = findNodes(card, '.file-card-gif-placeholder')[0];
      assert.match(label.innerHTML, new RegExp('<span>' + (index === 2 ? 'GIF' : 'WEBP') + '</span>'));
    } else assert.equal(images[0].src, file.thumbnailLink);
  }
  assert.equal(run(context, 'isGifFile(cardFiles[0])'), false, 'WebP remains separate from global GIF behavior');
  assert.equal(run(context, 'isGifFile(cardFiles[1])'), false);
  assert.equal(run(context, 'isGifFile(cardFiles[2])'), true);
});
