'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadAppContext(initialStorage = {}) {
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

test('OAuth uses the shipped client ID by default and preserves a valid custom override', () => {
  const defaultContext = loadAppContext();
  const defaultState = JSON.parse(run(defaultContext, `JSON.stringify({
    defaultId: DEFAULT_OAUTH_CLIENT_ID,
    clientId: state.clientId,
    override: state.clientIdOverride,
    stored: localStorage.getItem(CLIENT_ID_KEY)
  })`));
  assert.deepEqual(defaultState, {
    defaultId: '376776089602-t0te7oadl7ki589fnfdfhs173gco2n0l.apps.googleusercontent.com',
    clientId: '376776089602-t0te7oadl7ki589fnfdfhs173gco2n0l.apps.googleusercontent.com',
    override: '',
    stored: null
  });

  const customContext = loadAppContext({
    'drive-original.oauth-client-id': '123-custom.apps.googleusercontent.com'
  });
  const customState = JSON.parse(run(customContext, `JSON.stringify({
    clientId: state.clientId,
    override: state.clientIdOverride,
    stored: localStorage.getItem(CLIENT_ID_KEY)
  })`));
  assert.deepEqual(customState, {
    clientId: '123-custom.apps.googleusercontent.com',
    override: '123-custom.apps.googleusercontent.com',
    stored: '123-custom.apps.googleusercontent.com'
  });

  for (const redundantValue of [
    '376776089602-t0te7oadl7ki589fnfdfhs173gco2n0l.apps.googleusercontent.com',
    'not-a-valid-client-id'
  ]) {
    const migratedContext = loadAppContext({ 'drive-original.oauth-client-id': redundantValue });
    const migratedState = JSON.parse(run(migratedContext, `JSON.stringify({
      clientId: state.clientId,
      override: state.clientIdOverride,
      stored: localStorage.getItem(CLIENT_ID_KEY)
    })`));
    assert.deepEqual(migratedState, {
      clientId: '376776089602-t0te7oadl7ki589fnfdfhs173gco2n0l.apps.googleusercontent.com',
      override: '',
      stored: null
    });
  }
});

test('blank or default OAuth settings remove the override and only effective-ID changes reset the session', () => {
  const context = loadAppContext();
  const result = JSON.parse(run(context, `(() => {
    let tokenClears = 0;
    let sessionInvalidations = 0;
    const messages = [];
    el.settingsClientId = {
      value: '',
      removeAttribute() {},
      setAttribute() {},
      focus() {}
    };
    el.settingsClientIdHint = { textContent: '', classList: { add() {}, remove() {} } };
    el.clientIdHint = { textContent: '', classList: { add() {}, remove() {} } };
    clearToken = () => { tokenClears += 1; };
    invalidateDriveSessionData = () => { sessionInvalidations += 1; };
    showToast = (message) => { messages.push(message); };

    saveSettings();
    const afterBlank = {
      clientId: state.clientId,
      override: state.clientIdOverride,
      stored: localStorage.getItem(CLIENT_ID_KEY),
      tokenClears,
      sessionInvalidations
    };

    el.settingsClientId.value = '123-custom.apps.googleusercontent.com';
    saveSettings();
    const afterCustom = {
      clientId: state.clientId,
      override: state.clientIdOverride,
      stored: localStorage.getItem(CLIENT_ID_KEY),
      tokenClears,
      sessionInvalidations
    };

    el.settingsClientId.value = DEFAULT_OAUTH_CLIENT_ID;
    saveSettings();
    const afterDefault = {
      clientId: state.clientId,
      override: state.clientIdOverride,
      stored: localStorage.getItem(CLIENT_ID_KEY),
      tokenClears,
      sessionInvalidations
    };
    return JSON.stringify({ afterBlank, afterCustom, afterDefault, messages });
  })()`));

  assert.deepEqual(result.afterBlank, {
    clientId: '376776089602-t0te7oadl7ki589fnfdfhs173gco2n0l.apps.googleusercontent.com',
    override: '',
    stored: null,
    tokenClears: 0,
    sessionInvalidations: 0
  });
  assert.deepEqual(result.afterCustom, {
    clientId: '123-custom.apps.googleusercontent.com',
    override: '123-custom.apps.googleusercontent.com',
    stored: '123-custom.apps.googleusercontent.com',
    tokenClears: 1,
    sessionInvalidations: 1
  });
  assert.deepEqual(result.afterDefault, {
    clientId: '376776089602-t0te7oadl7ki589fnfdfhs173gco2n0l.apps.googleusercontent.com',
    override: '',
    stored: null,
    tokenClears: 2,
    sessionInvalidations: 2
  });
});

test('first load waits for a user gesture and the primary connect button uses the default client ID', async () => {
  const context = loadAppContext();
  const result = await run(context, `(async () => {
    let automaticRequests = 0;
    let interactiveRequests = 0;
    let setupShown = 0;
    bindElements = () => {};
    bindEvents = () => {};
    setupTouchGestures = () => {};
    setupInfiniteScroll = () => {};
    cleanupStaleOriginalBuffers = async () => {};
    setupServiceWorker = async () => {};
    loadSavedToken = () => false;
    updateConnectionBadge = () => {};
    showSetup = () => { setupShown += 1; };
    attemptSilentAutoLogin = async () => { automaticRequests += 1; };
    requestAccessToken = async () => { interactiveRequests += 1; };
    el.settingsClientId = { value: '' };
    el.currentOrigin = { textContent: '' };
    el.appVersion = { textContent: '' };
    el.settingsAppVersion = { textContent: '' };
    el.clientIdHint = { textContent: '', classList: { add() {}, remove() {} } };

    await init();
    beginAuthorization();
    return JSON.stringify({ automaticRequests, interactiveRequests, setupShown, clientId: state.clientId });
  })()`);

  assert.deepEqual(JSON.parse(result), {
    automaticRequests: 0,
    interactiveRequests: 1,
    setupShown: 1,
    clientId: '376776089602-t0te7oadl7ki589fnfdfhs173gco2n0l.apps.googleusercontent.com'
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
  assert.deepEqual([...deck.above, deck.below[0]], ['d', 'e', 'f']);
  assert.equal(deck.below[1], 'b');
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
    await new Promise((resolve) => setTimeout(resolve, 20));
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
  assert.equal(run(context, "parseRetryAfterMs('25')"), 10_000);
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
    state.clientId = 'test.apps.googleusercontent.com';
    state.mediaPermissionRetryCount = 0;
    let downloads = 0;
    let refreshes = 0;
    let cleared = 0;
    validateClientId = () => true;
    requestGoogleToken = async () => { refreshes += 1; return true; };
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

test('clearing a pending background token request lets the next generation start a fresh GIS request', async () => {
  const context = loadAppContext();
  const result = await run(context, `(async () => {
    let starts = 0;
    const callbacks = [];
    const oauth2 = {
      initTokenClient({ callback }) {
        callbacks.push(callback);
        return { requestAccessToken() { starts++; } };
      }
    };
    window.google = { accounts: { oauth2 } };
    google = window.google;
    state.clientId = '123-test.apps.googleusercontent.com';
    el.connectionBadge = { dataset: {}, querySelector() { return null; } };

    const first = attemptSilentAutoLogin({ background: true });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const beforeClear = starts;
    clearToken(false);
    const second = attemptSilentAutoLogin({ background: true });
    for (let index = 0; index < 4 && starts < 2; index++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    const afterSecondStart = starts;
    callbacks[1]?.({ error: 'access_denied' });
    await Promise.all([first, second]);
    return { beforeClear, afterSecondStart };
  })()`);
  const normalized = JSON.parse(JSON.stringify(result));

  assert.equal(normalized.beforeClear, 1);
  assert.equal(normalized.afterSecondStart, 2);
});
