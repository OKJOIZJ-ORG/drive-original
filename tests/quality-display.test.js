'use strict';
// Characterizes the playback badge for every playback mode and transport state.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { appSource, loadApp } = require('./app-loader.cjs');
const vm = require('node:vm');

const source = appSource;

function render(mode, verified, width = 0) {
  const node = () => ({ hidden: false, dataset: {}, textContent: '' });
  const c = {
    URL, URLSearchParams, Map, Set, Math, Promise, console, setTimeout, clearTimeout,
    __DRIVE_ORIGINAL_RUNTIME__: {},
    location: { href: 'https://example.test/', origin: 'https://example.test', pathname: '/', search: '', hash: '', protocol: 'https:' },
    navigator: {}, localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    document: { addEventListener() {}, getElementById() { return null; }, querySelector() { return null; }, querySelectorAll() { return []; }, documentElement: { dataset: {} } },
    window: { addEventListener() {}, matchMedia() { return { matches: false, addEventListener() {} }; } }
  };
  c.window.location = c.location;
  vm.createContext(c);
  loadApp(c);
  c.mode = mode; c.verified = verified; c.width = width;
  return JSON.parse(vm.runInContext(`
    updatePlayerNavigationLabels = () => {};
    for (const key of ['streamModeLabel','streamModeText','qualityBadge','mediaResolution']) el[key] = { hidden: false, dataset: {}, textContent: '' };
    el.videoPlayer = { hidden: false, videoWidth: width, videoHeight: width ? 1080 : 0 };
    state.demo = false;
    state.selected = { id: 'f', mimeType: 'video/mp4', size: '10', videoMediaMetadata: {} };
    state.mediaAttempt = 'native'; state.mediaPlaybackMode = PLAYBACK_MODE[mode]; state.mediaTransportVerified = verified;
    updateQualityDisplay();
    JSON.stringify({ stream: el.streamModeLabel.dataset.mode, label: el.streamModeText.textContent,
      badge: [el.qualityBadge.hidden, el.qualityBadge.dataset.quality, el.qualityBadge.textContent], resolution: el.mediaResolution.textContent });
  `, c));
}

test('buffered, range, sequential and transformed modes keep their badge and resolution text', () => {
  const rows = {};
  for (const mode of ['OPFS', 'MEMORY', 'RANGE', 'SEQUENTIAL', 'VIDEO_COMPATIBILITY', 'AUDIO_COMPATIBILITY', 'COMPATIBILITY']) {
    for (const verified of [false, true]) rows[`${mode}:${verified}`] = render(mode, verified, verified ? 1920 : 0);
  }
  for (const mode of ['OPFS', 'MEMORY']) {
    assert.equal(rows[`${mode}:false`].stream, 'buffer');
    assert.deepEqual(rows[`${mode}:false`].badge.slice(0, 2), [true, 'pending']);
    assert.deepEqual(rows[`${mode}:true`].badge.slice(0, 2), [false, 'buffer']);
  }
  assert.equal(rows['RANGE:true'].stream, 'range');
  assert.equal(rows['SEQUENTIAL:true'].stream, 'sequential');
  assert.equal(rows['RANGE:true'].badge[1], 'original');
  assert.equal(rows['VIDEO_COMPATIBILITY:true'].badge[1], 'video-transformed');
  assert.equal(rows['AUDIO_COMPATIBILITY:true'].badge[1], 'audio-transformed');
  assert.equal(rows['COMPATIBILITY:true'].stream, 'drive');
  assert.equal(rows['COMPATIBILITY:true'].badge[1], 'preview');
  for (const [key, row] of Object.entries(rows)) {
    if (key.startsWith('COMPATIBILITY')) continue;
    assert.equal(row.resolution, key.endsWith('true') ? '1920 × 1080 (FHD 1080p)' : '원본 해상도 분석 중…', key);
    assert.match(row.badge[2], /^· /, key);
  }
});
