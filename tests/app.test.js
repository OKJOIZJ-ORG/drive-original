'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadAppContext() {
  const storage = new Map();
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
      this.style = { setProperty() {} };
      this.classList = {
        add: (...names) => {
          const set = new Set(this.className.split(/\s+/).filter(Boolean));
          names.forEach((name) => set.add(name));
          this.className = [...set].join(' ');
        }
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

test('G-drive-scale render mounts at most 240 cards and never mounts GIF image sources', () => {
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
  assert.equal(findNodes(grid, 'img').length, 0);
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

test('Drive view and media URLs preserve required context', () => {
  const context = loadAppContext();
  const viewUrl = run(context, `buildDriveViewUrl({ id: 'file-id', resourceKey: 'raw-key_1' })`);
  assert.equal(new URL(viewUrl).searchParams.get('resourcekey'), 'raw-key_1');

  const mediaUrl = run(context, `(() => {
    state.mediaSession = 19;
    return buildMediaUrl({ id: 'file-id', mimeType: 'video/mp4' });
  })()`);
  assert.equal(new URL(mediaUrl).searchParams.get('session'), '19');
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
