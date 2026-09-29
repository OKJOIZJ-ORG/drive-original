'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

// Execute the actual presentation owner without unrelated app startup effects.
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const start = app.indexOf('function scheduleVideoFramePresentation(');
const end = app.indexOf('\nfunction onMediaReady()', start);
assert.ok(start >= 0 && end > start);
const presentationSource = app.slice(start, end);

test('same-session source replacement schedules a new presentation while stale frames cannot clear its loader', () => {
  const callbacks = [];
  const video = {
    hidden: false, dataset: {}, currentTime: 5.4,
    classList: { add() {}, remove() {} }, removeAttribute() {},
    requestVideoFrameCallback(callback) { callbacks.push(callback); }
  };
  const context = {
    el: { videoPlayer: video, mediaLoading: { hidden: false }, mediaError: { hidden: false } },
    state: { mediaSession: 7, mediaAttempt: 'q1' },
    mediaSourceGeneration: 10, mediaSeekGeneration: 1, mediaDiagnosticTrace: null,
    isCurrentMediaEvent: () => true, noteMediaFrameProgress() {},
    tryCaptureAmbientFrame() {}, updateQualityDisplay() {}, hideSwipeNeighbor() {}
  };
  vm.createContext(context);
  vm.runInContext(presentationSource, context);

  context.scheduleVideoFramePresentation(video, 7);
  context.scheduleVideoFramePresentation(video, 7);
  assert.equal(callbacks.length, 1, 'the same source keeps one pending presentation');

  context.mediaSourceGeneration = 11;
  context.mediaSeekGeneration = 2;
  context.scheduleVideoFramePresentation(video, 7);
  assert.equal(callbacks.length, 2, 'a rebuilt source in the same session owns a new callback');
  const currentKey = video.dataset.presentationSession;

  callbacks[0](0, { mediaTime: 3 });
  assert.equal(context.el.mediaLoading.hidden, false, 'superseded source cannot dismiss current loading');
  assert.equal(video.dataset.presentationSession, currentKey, 'stale callback cannot discard the current owner');

  callbacks[1](1, { mediaTime: 5.375 });
  assert.equal(context.el.mediaLoading.hidden, true, 'the current decoded frame completes its handoff');
  assert.equal(video.dataset.presentationSession, undefined);
});
