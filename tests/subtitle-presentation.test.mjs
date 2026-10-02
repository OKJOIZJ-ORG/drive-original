import test from 'node:test';
import assert from 'node:assert/strict';
import {createSubtitlePresentation, plainVttText} from '../media/subtitle-presentation.mjs';

const settle = () => new Promise(resolve => setImmediate(resolve));
function setup(read = async () => [{startTime: 3, endTime: 8, text: '<b>& literal'}]) {
  const clock = {ready: true, sourceTime: 4, elementTime: 1};
  const textTrack = {mode: 'disabled', cues: [], addCue(cue) {this.cues.push(cue);},
    removeCue(cue) {this.cues.splice(this.cues.indexOf(cue), 1);}};
  let reads = 0, disposals = 0, current = true;
  const reader = {selectedTrackId: null, select(id) {this.selectedTrackId = id;},
    async cuesAt(...args) {reads++; return read(...args);}, async dispose() {disposals++; return {settled: true};}};
  class Cue {constructor(start, end, text) {Object.assign(this, {startTime: start, endTime: end, text});}}
  const errors = [];
  const presentation = createSubtitlePresentation({reader, textTrack, Cue, getClock: () => clock,
    isCurrent: () => current, onError: error => errors.push(error.message)});
  return {presentation, reader, clock, textTrack, errors, reads: () => reads, disposals: () => disposals,
    stale: () => {current = false;}};
}

test('native cue times follow the current MSE shift and literal text, default off', async () => {
  const s = setup(); await s.presentation.update(); assert.equal(s.reads(), 0);
  s.presentation.select(3); await settle();
  assert.equal(s.textTrack.mode, 'showing');
  assert.deepEqual({...s.textTrack.cues[0]}, {startTime: 0, endTime: 5, text: '&lt;b&gt;&amp; literal'});
  assert.equal(plainVttText('&lt;script>'), '&amp;lt;script&gt;');
  s.clock.elementTime = 4; await s.presentation.update();
  assert.equal(s.reads(), 1); assert.equal(s.textTrack.cues[0].startTime, 3);
  await s.presentation.dispose(); assert.equal(s.textTrack.cues.length, 0); assert.equal(s.disposals(), 1);
});

test('bounded windows are reused during playback and reread after a backwards seek', async () => {
  const s = setup(); s.presentation.select(3); await settle();
  for (const time of [4.2, 4.4, 4.9]) {s.clock.sourceTime = time; s.clock.elementTime = time - 3; await s.presentation.update();}
  assert.equal(s.reads(), 1);
  s.clock.sourceTime = 1; s.clock.elementTime = 1; await s.presentation.update();
  assert.equal(s.reads(), 2);
  s.presentation.select(null); await settle(); assert.equal(s.textTrack.mode, 'disabled');
  await s.presentation.update(); assert.equal(s.reads(), 2); await s.presentation.dispose();
});

test('a late old selection cannot paint its cue and reads remain serialized', async () => {
  let finish; let requests = 0;
  const s = setup(() => ++requests === 1 ? new Promise(resolve => {finish = resolve;})
    : Promise.resolve([{startTime: 4, endTime: 5, text: 'new selection'}]));
  s.presentation.select(3); s.presentation.select(4);
  assert.equal(s.reads(), 1); finish([{startTime: 3, endTime: 8, text: 'stale selection'}]); await settle();
  assert.equal(s.reads(), 2); assert.equal(s.textTrack.cues.length, 1);
  assert.equal(s.textTrack.cues[0].text, 'new selection'); await s.presentation.dispose();
});

test('same failed read is reported once without timeupdate retry loops', async () => {
  const s = setup(async () => {throw new Error('SUBTITLE_BAD_BYTES');});
  s.presentation.select(3); await settle();
  for (let i = 0; i < 5; i++) await s.presentation.update();
  assert.equal(s.reads(), 1); assert.deepEqual(s.errors, ['SUBTITLE_BAD_BYTES']);
  assert.equal(s.textTrack.mode, 'disabled'); await s.presentation.dispose();
});

test('stale owner or dispose suppresses in-flight publication', async () => {
  let finish; const s = setup(() => new Promise(resolve => {finish = resolve;}));
  s.presentation.select(3); s.stale(); await s.presentation.dispose();
  finish([{startTime: 3, endTime: 8, text: 'late'}]); await settle();
  assert.equal(s.textTrack.cues.length, 0); assert.equal(s.textTrack.mode, 'disabled'); assert.deepEqual(s.errors, []);
});
