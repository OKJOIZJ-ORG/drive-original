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
  const appPath = path.join(__dirname, '..', 'app.js');
  vm.runInContext(fs.readFileSync(appPath, 'utf8'), context, { filename: appPath });
  return context;
}

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

function run(context, source) {
  return vm.runInContext(source, context);
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
    const installed = installSessionCredential({ accessToken: 'session-token', expiresAt, account: 'account-A', revision: 7 }, { generation: state.authGeneration });
    const rejected = [
      installSessionCredential({ accessToken: '', expiresAt, account: 'account-A', revision: 8 }, { generation: state.authGeneration }),
      installSessionCredential({ accessToken: 'near-expiry', expiresAt: Date.now() + TOKEN_SKEW_MS, account: 'account-A', revision: 8 }, { generation: state.authGeneration }),
      installSessionCredential({ accessToken: 'bad-account', expiresAt, account: 'bad account', revision: 8 }, { generation: state.authGeneration }),
      installSessionCredential({ accessToken: 'string-numbers', expiresAt: String(expiresAt), account: 'account-A', revision: '8' }, { generation: state.authGeneration })
    ];
    return JSON.stringify({ installed, rejected, token: state.token, expiresAt: state.expiresAt, account: state.authAccountKey, revision: state.tokenRevision,
      legacyToken: localStorage.getItem(LEGACY_TOKEN_STORAGE_KEY), legacyClient: localStorage.getItem(LEGACY_CLIENT_ID_STORAGE_KEY),
      hasClientId: Object.hasOwn(state, 'clientId') });
  })()`));
  assert.deepEqual(result, {
    installed: true,
    rejected: [false, false, false, false],
    token: 'session-token',
    expiresAt: result.expiresAt,
    account: 'account-A',
    revision: 7,
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
    return new Response(JSON.stringify({ accessToken: 'renewed-token', expiresAt: Date.now() + 60_000, account: 'account-A', revision: 4 }), {
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
  assert.deepEqual(JSON.parse(request.options.body), { expectedAccount: 'account-A', rejectedRevision: null });
  assert.equal(request.options.credentials, 'same-origin');
  assert.equal(request.options.cache, 'no-store');
  assert.equal(request.options.mode, 'same-origin');
  assert.equal(request.options.redirect, 'error');
  assert.equal(request.options.headers['X-Drive-Original-CSRF'], '1');
  assert.equal(run(context, 'state.tokenRevision'), 4);
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

test('offline and non-JSON credential failures are bounded and preserve the current memory credential', async () => {
  const context = loadAppContext(); let calls = 0;
  context.fetch = async () => {
    calls += 1;
    return new Response('temporarily unavailable', { status: 503, headers: { 'Content-Type': 'text/plain' } });
  };
  run(context, `state.authAccountKey='account-A';state.token='still-valid';state.expiresAt=Date.now()+60_000;state.tokenRevision=5;
    el.connectionBadge={dataset:{},querySelector(){return null}};el.authHint={textContent:'',classList:{add(){},remove(){}}};`);
  assert.equal(await run(context, 'requestSessionCredential({background:true,force:true})'), false);
  assert.equal(run(context, 'state.token'), 'still-valid');
  run(context, 'navigator.onLine=false');
  assert.equal(await run(context, 'requestSessionCredential({background:true,force:true})'), false);
  assert.equal(calls, 1);
  assert.equal(run(context, 'state.token'), 'still-valid');
});

test('concurrent credential waiters share one failed request without starting another fetch', async () => {
  const context = loadAppContext(); let calls = 0; let release;
  context.fetch = async () => {
    calls += 1;
    await new Promise((resolve) => { release = resolve; });
    return new Response(JSON.stringify({ error: { code: 'auth_unavailable' } }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  };
  run(context, `el.connectionBadge={dataset:{},querySelector(){return null}};el.authHint={textContent:'',classList:{add(){},remove(){}}};`);
  const first = run(context, 'requestSessionCredential({background:true,force:true})');
  const second = run(context, 'requestSessionCredential({background:true,force:true})');
  release();
  assert.deepEqual(await Promise.all([first, second]), [false, false]);
  assert.equal(calls, 1);
});

test('a credential response parsed after its account generation changes cannot install', async () => {
  const context = loadAppContext(); let release;
  context.fetch = async () => ({
    ok: true,
    headers: new Headers({ 'Content-Type': 'application/json' }),
    json: async () => {
      await new Promise((resolve) => { release = resolve; });
      return { accessToken: 'late-token', expiresAt: Date.now() + 60_000, account: 'account-A', revision: 2 };
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
      installSessionCredential({accessToken:'other-account',expiresAt:Date.now()+60_000,account:'account-B',revision:6},{generation:state.authGeneration}),
      installSessionCredential({accessToken:'stale',expiresAt:Date.now()+60_000,account:'account-A',revision:4},{generation:state.authGeneration}),
      installSessionCredential({accessToken:'changed-same-revision',expiresAt:Date.now()+60_000,account:'account-A',revision:5},{generation:state.authGeneration}),
      installSessionCredential({accessToken:'same-text',expiresAt:Date.now()+60_000,account:'account-A',revision:6},{generation:state.authGeneration})
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

test('double-tap reserves only narrow video edges for seek and likes everywhere else', () => {
  const context = loadAppContext();
  assert.equal(run(context, 'resolveMediaDoubleTapAction(10, 0, 400, true)'), 'seek-backward');
  assert.equal(run(context, 'resolveMediaDoubleTapAction(390, 0, 400, true)'), 'seek-forward');
  assert.equal(run(context, 'resolveMediaDoubleTapAction(120, 0, 400, true)'), 'favorite');
  assert.equal(run(context, 'resolveMediaDoubleTapAction(10, 0, 400, false)'), 'favorite');
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
    driveFetch = async (url, options) => {
      captured = { url, options };
      return { json: async () => ({ id: 'state-file' }) };
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
    created: { id: 'state-file' },
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

test('initial video playback uses temporary disk only when the safe automatic OPFS policy is proven', () => {
  const context = loadAppContext();
  const routes = JSON.parse(run(context, `JSON.stringify({
    safeVideo: chooseInitialOriginalPlaybackRoute({
      isVideo: true,
      policy: { decision: 'auto', mode: 'disk' }
    }),
    largeVideo: chooseInitialOriginalPlaybackRoute({
      isVideo: true,
      policy: { decision: 'confirm', mode: 'disk' }
    }),
    memoryOnlyVideo: chooseInitialOriginalPlaybackRoute({
      isVideo: true,
      policy: { decision: 'auto', mode: 'memory' }
    }),
    image: chooseInitialOriginalPlaybackRoute({
      isVideo: false,
      policy: { decision: 'auto', mode: 'disk' }
    })
  })`));
  assert.deepEqual(routes, {
    safeVideo: 'original-opfs',
    largeVideo: 'original-range',
    memoryOnlyVideo: 'original-range',
    image: 'original-range'
  });
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
    const beforeFrame = { hiddenNeighbours, ready: classes.has('is-ready') };
    frameCallback?.(0, { mediaTime: 0 });
    return JSON.stringify({
      beforeFrame,
      afterFrame: { hiddenNeighbours, ready: classes.has('is-ready') }
    });
  })()`));
  assert.deepEqual(result, {
    beforeFrame: { hiddenNeighbours: 0, ready: false },
    afterFrame: { hiddenNeighbours: 1, ready: true }
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
    'intent', 'session-changed', 'request-cancelled', 'headers', 'trace-finished'
  ]);
  assert.equal(result.events[0].fileKey, 'file-1');
  assert.equal(result.events[2].requestId, 'media-1');
  assert.equal(result.events[2].stale, true);
  assert.equal(result.events[3].requestId, 'media-2');
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
    frameCallback?.(0, { mediaTime: 0 });
    const after = events.map((event) => event.stage);
    return JSON.stringify({ before, after, ready: classes.has('is-ready') });
  })()`));

  assert.equal(result.before.includes('first-decoded-frame'), false);
  assert.equal(result.after.includes('first-decoded-frame'), true);
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
  assert.equal(new URL(mediaUrl).searchParams.get('size'), '1000');
});

test('original-first recovery router never downgrades transient failures before retry and buffer recovery', () => {
  const context = loadAppContext();
  const decisions = JSON.parse(run(context, `JSON.stringify({
    auth: decideMediaRecovery({ cause: 'auth' }),
    serverFirst: decideMediaRecovery({ cause: 'server', rangeRetryCount: 0 }),
    serverAfterRetry: decideMediaRecovery({ cause: 'server', rangeRetryCount: 1 }),
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
  assert.equal(run(context, "classifyMediaProxyFailure({ status: 502 })"), 'server');
  assert.equal(run(context, "parseRetryAfterMs('25')"), 25_000);
  assert.equal(run(context, "parseRetryAfterMs('invalid')"), 0);
  assert.equal(run(context, "getUnsatisfiedRangeSize('bytes */987654')"), 987654);
  assert.equal(run(context, "getUnsatisfiedRangeSize('bytes 0-9/10')"), null);
  assert.equal(run(context, "isLocalOriginalStorageError({ name: 'QuotaExceededError' })"), true);
  assert.equal(run(context, "isLocalOriginalStorageError({ message: 'Original file exceeds temporary storage' })"), true);
  assert.equal(run(context, "isLocalOriginalStorageError({ status: 503, message: 'backend unavailable' })"), false);
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
    state.pendingSecurityConfirmation = { fileId: file.id, session: 22, stage: 'range' };
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
