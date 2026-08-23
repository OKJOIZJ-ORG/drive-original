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
          const set = new Set(this.className.split(/\\s+/).filter(Boolean));
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
      const classes = String(node.className || '').split(/\\s+/);
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
