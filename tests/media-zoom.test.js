'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');
const { loadApp, appSource } = require('./app-loader.cjs');

function classList() {
  const names = new Set();
  return {
    add: (...items) => items.forEach((item) => names.add(item)),
    remove: (...items) => items.forEach((item) => names.delete(item)),
    toggle: (item, on) => { if (on ?? !names.has(item)) names.add(item); else names.delete(item); },
    contains: (item) => names.has(item)
  };
}

// A 400×800 portrait stage showing a 1920×1080 landscape video: object-fit
// contain letterboxes it to 400×225 in the middle of the stage.
function client(storage = new Map()) {
  const c = { AbortController, Blob, DOMException, Headers, Map, Set, Math, Promise, Response, URL, URLSearchParams, console, setTimeout, clearTimeout, setInterval, clearInterval, performance,
    location: { href: 'https://fixture.test/', origin: 'https://fixture.test', pathname: '/', search: '' },
    navigator: { onLine: true, maxTouchPoints: 5 },
    localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)), removeItem: (key) => storage.delete(key) },
    document: { addEventListener() {}, querySelectorAll() { return []; }, visibilityState: 'visible', documentElement: { dataset: {} } },
    requestAnimationFrame() {} };
  c.window = { addEventListener() {}, removeEventListener() {}, innerWidth: 400, innerHeight: 800, matchMedia: () => ({ matches: false }), location: c.location };
  c.matchMedia = c.window.matchMedia;
  vm.createContext(c);
  loadApp(c);
  c.run = (code) => vm.runInContext(code, c);
  const stage = { clientWidth: 400, clientHeight: 800, classList: classList(),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 800 }),
    contains: (node) => node === stage || node === c.video };
  c.video = { hidden: false, offsetWidth: 400, offsetHeight: 800, videoWidth: 1920, videoHeight: 1080, style: {}, dataset: {} };
  c.image = { hidden: true, style: {} };
  Object.assign(c.run('el'), { mediaStage: stage, videoPlayer: c.video, imageViewer: c.image, playerSheet: { hidden: false }, playerFeedback: null });
  c.run(`state.mediaAttempt = ''`);
  c.zoom = () => JSON.parse(c.run('JSON.stringify(mediaZoom)'));
  return c;
}

const touch = (identifier, clientX, clientY, target) => ({ identifier, clientX, clientY, target });
const touchEvent = (touches) => ({ touches, cancelable: true, prevented: false, preventDefault() { this.prevented = true; } });

test('pinch keeps the content under the fingers and stops at the picture edges', () => {
  const c = client();
  c.run('zoomMediaAround(mediaZoom, 2, 300, 400)');
  // Focal (300,400) is 100px right of center; at 2× that content point would be
  // 200px right, so the view shifts left by 100. The 800×450 picture can pan ±200.
  assert.deepEqual(c.zoom(), { scale: 2, x: -100, y: 0 });
  assert.equal(c.video.style.scale, '2');
  assert.equal(c.video.style.translate, '-100px 0px');
  c.run('applyMediaZoom({ scale: 2, x: -900, y: 500 })');
  assert.deepEqual(c.zoom(), { scale: 2, x: -200, y: 0 }, 'letterbox bars never pan into view');
  c.run('zoomMediaAround(mediaZoom, 40, 200, 400)');
  assert.equal(c.zoom().scale, 5, 'zoom is bounded');
  c.run('zoomMediaAround(mediaZoom, 0.2, 200, 400)');
  assert.deepEqual(c.zoom(), { scale: 1, x: 0, y: 0 }, 'zooming out never shrinks below the fitted size');
  assert.equal(c.video.style.scale, '');
});

test('two-finger touch pinches, a leftover finger is consumed, and new media resets the zoom', () => {
  const c = client();
  const start = touchEvent([touch(1, 150, 400, c.video), touch(2, 250, 400, c.video)]);
  c.startEvent = start;
  assert.equal(c.run('beginTouchPinch(startEvent)'), true);
  assert.equal(start.prevented, true, 'the browser never page-zooms the player');
  c.moveEvent = touchEvent([touch(1, 100, 400, c.video), touch(2, 300, 400, c.video)]);
  c.run('updateTouchPinch(moveEvent)');
  assert.equal(c.zoom().scale, 2);
  c.endEvent = touchEvent([touch(1, 100, 400, c.video)]);
  c.run('endTouchPinch(endEvent)');
  assert.equal(c.run('touchPinchDraining'), true, 'the remaining finger stays owned by the pinch');
  assert.equal(c.zoom().scale, 2);
  c.run('endTouchPinch({ touches: [], preventDefault() {} })');
  assert.equal(c.run('touchPinchDraining'), false);
  c.run('resetMediaZoom()');
  assert.deepEqual(c.zoom(), { scale: 1, x: 0, y: 0 });
});

test('the zoom lock persists, freezes the view and blocks pinch, Ctrl+wheel and pan', () => {
  const storage = new Map();
  const c = client(storage);
  c.run('zoomMediaAround(mediaZoom, 2, 200, 400)');
  c.run('setMediaZoomLocked(true)');
  assert.equal(storage.get('drive-original.zoom-locked'), '1');
  c.startEvent = touchEvent([touch(1, 150, 400, c.video), touch(2, 250, 400, c.video)]);
  assert.equal(c.run('beginTouchPinch(startEvent)'), true, 'a locked pinch is still consumed');
  c.run('updateTouchPinch({ touches: [{ identifier: 1, clientX: 0, clientY: 400 }, { identifier: 2, clientX: 400, clientY: 400 }], preventDefault() {} })');
  c.wheel = { ctrlKey: true, deltaY: -30, deltaMode: 0, clientX: 200, clientY: 400, target: c.video, preventDefault() { this.prevented = true; } };
  c.run('onMediaStageWheel(wheel)');
  assert.equal(c.wheel.prevented, true);
  assert.equal(c.zoom().scale, 2, 'locked zoom keeps its scale');
  assert.equal(c.run('canAdjustMediaZoom()'), false, 'one-finger drags swipe instead of panning');

  const reloaded = client(storage);
  assert.equal(reloaded.run('mediaZoomLocked'), true, 'the choice survives a reload');
  reloaded.run('setMediaZoomLocked(false)');
  reloaded.wheel = { ctrlKey: true, deltaY: -30, deltaMode: 0, clientX: 200, clientY: 400, target: reloaded.video, preventDefault() {} };
  reloaded.run('onMediaStageWheel(wheel)');
  assert.ok(reloaded.zoom().scale > 1.3, 'Ctrl+wheel and trackpad pinch zoom when unlocked');
});

test('double taps keep seek and like meanings and never zoom', () => {
  const tapSource = appSource.slice(appSource.indexOf('function handleStageTap('), appSource.indexOf('function setupTouchGestures('));
  assert.doesNotMatch(tapSource, /Zoom/);
  assert.match(appSource, /addEventListener\('dblclick', \(event\) => event\.preventDefault\(\)\)/);
});
