'use strict';
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const test = require('node:test'), assert = require('node:assert/strict');
const fixture = {exports: {}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'app.test.js'), 'utf8').split('\ntest(')[0]
  + '\nmodule.exports=loadAppContext;', {require, __dirname, module: fixture,
    AbortController, Blob, DOMException, Headers, Map, Math, Promise, Response, Set, URL, URLSearchParams,
    clearInterval, clearTimeout, console, fetch, performance, setInterval, setTimeout});
const run = (c, code) => vm.runInContext(code, c);

function nativeChoice() {
  const c = fixture.exports();
  run(c, `globalThis.errors=0;globalThis.chosen=null;el.playerAudioTrack={value:'3',disabled:false};
    el.playerTracksStatus={textContent:''};el.playerTracksDialog={open:false};
    playerTracksOwner={file:{id:'fixture'},session:1,identity:{headRevisionId:'A'},current:()=>true,cleanupOk:true,
      inventory:{audioTracks:[{trackId:3,route:'q1'}]}};
    capturePlaybackSnapshot=()=>({time:2,paused:true});showMediaError=()=>errors++;
    tryOriginalTsPlayback=async(file,session,options)=>{chosen=options;return true;};`);
  return c;
}

test('native audio choice joins the retirement barrier with no previous Q1 owner', async () => {
  const c = nativeChoice(); await run(c, 'selectPlayerAudioTrack()');
  assert.equal(c.chosen.selectedAudioTrackId, 3); assert.equal(c.chosen.expectedIdentity.headRevisionId, 'A');
  assert.equal(c.chosen.snapshotOverride.paused, true); assert.equal(c.errors, 0);
  assert.equal(run(c, 'playerTracksOwner.switching'), false); assert.equal(run(c, 'el.playerAudioTrack.disabled'), false);
});

test('unavailable explicit choice reports a visible error and releases the switch owner', async () => {
  const c = nativeChoice(); run(c, 'tryOriginalTsPlayback=async()=>false;');
  await run(c, 'selectPlayerAudioTrack()'); assert.equal(c.errors, 1);
  assert.equal(run(c, 'state.mediaAttempt'), 'failed'); assert.equal(run(c, 'playerTracksOwner.switching'), false);
  assert.equal(run(c, 'playerTracksOwner.selectedAudioTrackId'), 3, 'language choice remains explicit even after failure');
});

test('track retirement cancels immediately and waits for the late inventory owner', async () => {
  const c = fixture.exports();
  run(c, `globalThis.closed=0;globalThis.cancelled=0;globalThis.finish=null;
    el.playerTracksDialog={open:true,close(){closed++;this.open=false;}};
    globalThis.old={controller:new AbortController(),source:{abort:async()=>{cancelled++;return {settled:true};}},
      cleanupOk:true,loading:new Promise(resolve=>finish=()=>{old.cleanupOk=false;resolve();})};
    playerTracksOwner=old;globalThis.retiring=retirePlayerTracks();`);
  assert.equal(run(c, 'old.controller.signal.aborted'), true);
  assert.equal(run(c, 'playerTracksOwner'), null); assert.equal(c.closed, 1); assert.equal(c.cancelled, 1);
  let done = false; c.retiring.then(() => {done = true;});
  await Promise.resolve(); assert.equal(done, false);
  c.finish(); assert.equal((await c.retiring).settled, false);
  assert.equal(run(c, 'playerTracksRetirementResult.settled'), false);
  assert.equal((await run(c, 'retirePlayerTracks()')).settled, false, 'empty retirement cannot erase the failure');
});

test('uncertain independent reader cleanup blocks a new original transport', () => {
  const c = fixture.exports();
  run(c, `globalThis.errors=0;state.selected={id:'fixture'};state.mediaSession=2;
    el.videoPlayer={src:'unchanged'};playerTracksRetirementResult={settled:false};
    retireQ0Playback=()=>{};showMediaError=()=>errors++;`);
  assert.equal(run(c, "startOriginalRangePlayback(state.selected,'video',2)"), false);
  assert.equal(c.errors, 1); assert.equal(run(c, 'el.videoPlayer.src'), 'unchanged');
});

test('snapshot retains selected audio identity and the next initial route keeps that choice', async () => {
  const c = fixture.exports();
  run(c, `state.selected={id:'fixture'};state.mediaSession=2;
    el.videoPlayer={hidden:false,paused:true,currentTime:3,duration:6,volume:.6,muted:false,playbackRate:1};
    q1Playback={selectedAudioTrackId:3,audioCompatibility:true,routeIdentity:{headRevisionId:'A'}};
    document.fullscreenElement=null;globalThis.snapshot=capturePlaybackSnapshot();
    state.resumePosition={fileId:'fixture',time:snapshot.time,snapshot};q1Playback=null;
    retireQ0Playback=()=>{};globalThis.chosen=null;
    tryOriginalTsPlayback=async(file,session,options)=>{chosen=options;return true;};`);
  await run(c, "startInitialOriginalPlayback(state.selected,'video',2)");
  assert.equal(c.chosen.selectedAudioTrackId, 3); assert.equal(c.chosen.audioCompatibility, true);
  assert.equal(c.chosen.expectedIdentity.headRevisionId, 'A'); assert.equal(c.chosen.snapshotOverride.paused, true);
});

test('reopened track inventory seeds the active selected audio only within its current lifetime', () => {
  const make = () => {
    const c = fixture.exports();
    run(c, `state.selected={id:'fixture'};state.mediaSession=2;state.authAccountKey='auth';state.driveSessionGeneration=7;
      mediaSourceGeneration=4;navigator.serviceWorker={controller:{}};collapseShortsExpand=()=>{};
      Option=function(text,value){this.text=text;this.value=value;};
      el.videoPlayer={hidden:false};el.playerSheet={hidden:false};el.playerTracksDialog={showModal(){},open:true};
      el.playerTracksStatus={textContent:''};el.playerAudioTrack={replaceChildren(){}};el.playerSubtitleTrack={replaceChildren(){}};
      playerTracksRetirement=new Promise(()=>{});
      q1Playback={fileId:'fixture',session:2,account:'auth',accountGeneration:7,
        swController:navigator.serviceWorker.controller,swGeneration:4,controller:new AbortController(),
        selectedAudioTrackId:3,routeIdentity:{headRevisionId:'A'},nativeColorObservation:{basis:'observed-native-frame'}};`);
    return c;
  };
  const c = make(); run(c, 'void openPlayerTracks()');
  assert.equal(run(c, 'playerTracksOwner.selectedAudioTrackId'), 3);
  assert.equal(run(c, 'playerTracksOwner.identity.headRevisionId'), 'A');
  assert.equal(run(c, 'playerTracksOwner.identity === q1Playback.routeIdentity'), false);
  assert.equal(run(c, 'playerTracksOwner.nativeColorObservation === q1Playback.nativeColorObservation'), true);
  for (const stale of ["q1Playback.fileId='other'", 'q1Playback.session++', "q1Playback.account='other'",
    'q1Playback.accountGeneration++', 'q1Playback.swController={}', 'q1Playback.swGeneration++', 'q1Playback.controller.abort()']) {
    const other = make(); run(other, stale); run(other, 'void openPlayerTracks()');
    assert.equal(run(other, 'playerTracksOwner.selectedAudioTrackId'), undefined, stale);
    assert.equal(run(other, 'playerTracksOwner.identity'), null, stale);
    assert.equal(run(other, 'playerTracksOwner.nativeColorObservation'), null, stale);
  }
});

test('audio switch observes native color before retirement and carries it to the selected successor', async () => {
  const c = nativeChoice();
  run(c, `globalThis.order=[];globalThis.color={basis:'observed-native-frame'};
    observePinnedNativePlayerColor=async()=>{order.push('observe');return color;};
    q1Playback={};retireQ1Playback=async()=>{order.push('retire');return {settled:true};};
    tryOriginalTsPlayback=async(file,session,options)=>{order.push('start');chosen=options;return true;};`);
  await run(c, 'selectPlayerAudioTrack()');
  assert.deepEqual(Array.from(c.order), ['observe', 'retire', 'start']);
  assert.equal(c.chosen.nativeColorObservation, c.color);
});

test('stale switch while native color observation loads cannot retire or start a successor', async () => {
  const c = nativeChoice();
  run(c, `globalThis.release=null;globalThis.alive=true;globalThis.retired=0;
    playerTracksOwner.current=()=>alive;observePinnedNativePlayerColor=()=>new Promise(r=>release=r);
    q1Playback={};retireQ1Playback=async()=>{retired++;return {settled:true};};`);
  const switching = run(c, 'selectPlayerAudioTrack()');
  run(c, 'alive=false;release({basis:"observed-native-frame"})');
  await switching;
  assert.equal(c.retired, 0); assert.equal(c.chosen, null);
  assert.equal(run(c, 'playerTracksOwner.switching'), false);
});

test('unavailable observation keeps the already qualified same-lifetime observation', async () => {
  const c = nativeChoice();
  run(c, `globalThis.color={basis:'observed-native-frame'};playerTracksOwner.nativeColorObservation=color;
    observePinnedNativePlayerColor=async()=>null;`);
  await run(c, 'selectPlayerAudioTrack()');
  assert.equal(c.chosen.nativeColorObservation, c.color);
});

function nativeColorFixture() {
  const c = fixture.exports();
  c.VideoFrame = function() {};
  const app = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
  const observe = app.slice(app.indexOf('async function observePinnedNativePlayerColor('),
    app.indexOf('\nasync function selectPlayerAudioTrack('))
    .replace("import('./media/native-color.mjs')", 'fakeColorModule');
  c.fakeColorModule = {observeNativeFrameColor: ({identity, isCurrent}) => {
    c.captures++; assert.equal(isCurrent(), true); return {basis:'observed-native-frame',identity};
  }};
  c.captures = 0; run(c, observe);
  run(c, `state.selected={id:'fixture'};state.mediaSession=2;state.authAccountKey='a';state.driveSessionGeneration=7;
    state.mediaTransportVerified=true;state.mediaPlaybackMode=PLAYBACK_MODE.RANGE;state.mediaDecodeVerified=true;
    navigator.serviceWorker={controller:{}};mediaSourceGeneration=4;
    q0PinnedSource={descriptor:{fileId:'fixture'}};
    q0Playback={fileId:'fixture',session:2,account:'a',accountGeneration:7,swGeneration:4,
      swController:navigator.serviceWorker.controller,controller:new AbortController()};
    el.videoPlayer={hidden:false,dataset:{mediaSession:'2'},currentSrc:buildPinnedMediaUrl(state.selected)};`);
  return c;
}

test('native color read uses the live pinned original only and rechecks after module loading', async () => {
  const c = nativeColorFixture();
  assert.equal((await run(c, 'observePinnedNativePlayerColor(state.selected,2)')).basis, 'observed-native-frame');
  assert.equal(c.captures, 1);
  for (const stale of ['q0Playback.controller.abort()', 'q0Playback.session++', 'mediaSourceGeneration++',
    "state.authAccountKey='other'", 'state.driveSessionGeneration++', 'navigator.serviceWorker.controller={}',
    "q0PinnedSource.descriptor.fileId='other'", 'el.videoPlayer.hidden=true', 'el.videoPlayer.dataset.mediaSession="1"',
    'state.mediaTransportVerified=false', 'state.mediaDecodeVerified=false', 'el.videoPlayer.currentSrc="blob:other"',
    'globalThis.VideoFrame=undefined']) {
    const other = nativeColorFixture(); run(other, stale);
    assert.equal(await run(other, 'observePinnedNativePlayerColor(state.selected,2)'), null, stale);
    assert.equal(other.captures, 0, stale);
  }
  const late = nativeColorFixture(); let release;
  late.fakeColorModule = new Promise(r => {release=r;});
  const reading = run(late, 'observePinnedNativePlayerColor(state.selected,2)');
  run(late, 'q0PinnedSource={descriptor:{fileId:"fixture"}}');
  release(c.fakeColorModule); assert.equal(await reading, null); assert.equal(late.captures, 0);
});
