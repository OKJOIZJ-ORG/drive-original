'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { appSource, loadApp } = require('./app-loader.cjs');
const vm = require('node:vm');

function client() {
  const frames = [];
  const c = { AbortController, Blob, DOMException, Headers, Map, Math, Promise, Response, Set, URL, URLSearchParams,
    console, performance, fetch, setTimeout, clearTimeout, setInterval, clearInterval,
    location: { href: 'https://fixture.test/', origin: 'https://fixture.test', pathname: '/', search: '' },
    navigator: { onLine: true }, localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    document: { addEventListener() {}, removeEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; }, visibilityState: 'visible' },
    requestAnimationFrame(fn) { frames.push(fn); } };
  c.window = { addEventListener() {}, removeEventListener() {}, innerWidth: 390, matchMedia: () => ({ matches: false }), location: c.location };
  c.matchMedia = c.window.matchMedia;
  vm.createContext(c);
  loadApp(c);
  c.run = code => vm.runInContext(code, c);
  c.paint = () => { for (const fn of frames.splice(0)) fn(); };
  c.run(`state.selected={id:'fixture'};state.accountId='account-A';state.authAccountKey='account-A';
    state.accountIdentityPending=false;state.mediaAttempt='range';state.mediaSession=1;
    el.playerSheet={hidden:false};el.mediaError={hidden:true};
    const viewed=[];markFileViewed=id=>viewed.push(id);const passed=[];markFilePassed=id=>passed.push(id);
    const timers=[];setTimeout=(fn,ms)=>timers.push({fn,ms});clearTimeout=()=>{};
    globalThis.play=(from,to,step=.5)=>{for(let t=from;t<=to+1e-9;t+=step)noteViewedVideoPresentation(el.videoPlayer,t,'decoded-frame');};
    globalThis.runTimers=()=>{for(const t of timers.splice(0))t.fn();};
    el.videoPlayer={hidden:false,paused:false,seeking:false,readyState:2,currentTime:0,duration:100,dataset:{mediaSession:'1'}};
    el.imageViewer={hidden:false,complete:true,naturalWidth:12,naturalHeight:12,src:'fixture-image',dataset:{mediaSession:'1'},decode:()=>Promise.resolve()};`);
  return c;
}

test('normal account sync is silent; local storage and sync errors remain truthful', () => {
  const c = client();
  c.run(`el.accountSyncStatus={hidden:false,dataset:{},textContent:''}; updateAccountSyncStatus();`);
  assert.equal(c.run('el.accountSyncStatus.hidden'), true);
  c.run(`state.accountStateSyncTimer=1;updateAccountSyncStatus();`);
  assert.equal(c.run('el.accountSyncStatus.hidden'), true);
  assert.equal(c.run('el.accountSyncStatus.dataset.state'), 'syncing');
  c.run(`state.accountLocalStorageError=true;updateAccountSyncStatus();`);
  assert.equal(c.run('el.accountSyncStatus.hidden'), false);
  assert.match(c.run('el.accountSyncStatus.textContent'), /저장하지 못/);
  c.run(`state.accountLocalStorageError=false;state.accountStateSyncError=true;updateAccountSyncStatus();`);
  assert.equal(c.run('el.accountSyncStatus.hidden'), false);
  c.run(`state.accountStateSyncError=false;updateAccountSyncStatus();`);
  assert.equal(c.run('el.accountSyncStatus.hidden'), true);
});

test('a video counts as viewed after 30 s of playback, not on open, paused frames or seeks', () => {
  const c = client();
  c.run('beginMediaViewObservation();');
  c.run(`noteViewedVideoPresentation(el.videoPlayer,0,'decoded-frame');`);
  c.run(`el.videoPlayer.paused=true;noteViewedVideoPresentation(el.videoPlayer,5,'decoded-frame');`);
  c.run(`el.videoPlayer.paused=false;el.videoPlayer.seeking=true;noteViewedVideoPresentation(el.videoPlayer,6,'decoded-frame');`);
  c.run(`el.videoPlayer.seeking=false;play(6,35.5);`);
  assert.equal(c.run('viewed.length'), 0, '29.5 s played');
  c.run(`play(36,36);`);
  assert.equal(c.run('viewed.length'), 1);
  c.run(`play(36.5,60);`);
  assert.equal(c.run('viewed.length'), 1, 'one view per opening');
});

test('a short video counts after 70 % of its length; jumps and loop restarts add nothing', () => {
  const c = client();
  c.run(`el.videoPlayer.duration=10;beginMediaViewObservation();play(0,3);`);
  c.run(`play(8,9);`); // jump 3 -> 8 is not playback: 3 + 1 s
  assert.equal(c.run('mediaViewObservation.watchedSeconds'), 4);
  c.run(`play(0,2.5);`); // loop restart back to 0
  assert.equal(c.run('viewed.length'), 0);
  c.run(`play(3,3.5);`);
  assert.equal(c.run('viewed.length'), 1, '4 + 2.5 + 0.5 = 7 s of a 10 s video');
});

test('hidden, failed, stale-session and account-switched videos cannot write viewed state', () => {
  for (const change of ["document.visibilityState='hidden'", 'el.playerSheet.hidden=true', 'el.mediaError.hidden=false', 'state.mediaSession++', "state.accountId='account-B'", 'state.driveSessionGeneration++']) {
    const c = client();
    c.run(`beginMediaViewObservation();noteViewedVideoPresentation(el.videoPlayer,0,'decoded-frame');${change};play(.5,40);`);
    assert.equal(c.run('viewed.length'), 0, change);
  }
});

test('playback on both sides of a seek adds up within one opening', () => {
  for (const change of ['mediaSourceGeneration++', 'mediaSeekGeneration++']) {
    const c = client();
    c.run(`beginMediaViewObservation();play(0,20);${change};play(50,59.5);`);
    assert.equal(c.run('viewed.length'), 0, change);
    c.run(`play(60,60);`);
    assert.equal(c.run('viewed.length'), 1, change);
  }
});

test('a photo counts as viewed after 2 s on screen, after decode and paint', async () => {
  const c = client();
  c.run(`beginMediaViewObservation();scheduleImageViewedPresentation(el.imageViewer);`);
  await Promise.resolve(); await Promise.resolve();
  c.paint(); c.paint();
  assert.equal(c.run('viewed.length'), 0);
  assert.equal(c.run('timers.length===1&&timers[0].ms'), 2000);
  c.run('runTimers()');
  assert.equal(c.run('viewed.length'), 1);
  const stale = client();
  stale.run(`let release;el.imageViewer.decode=()=>new Promise(resolve=>release=resolve);beginMediaViewObservation();scheduleImageViewedPresentation(el.imageViewer);state.accountId='account-B';release();`);
  await Promise.resolve(); await Promise.resolve(); stale.paint(); stale.paint(); stale.run('runTimers()');
  assert.equal(stale.run('viewed.length'), 0);
  const left = client();
  left.run(`beginMediaViewObservation();scheduleImageViewedPresentation(el.imageViewer);`);
  await Promise.resolve(); await Promise.resolve(); left.paint(); left.paint();
  left.run(`state.mediaSession++;runTimers();`);
  assert.equal(left.run('viewed.length'), 0, 'another file before 2 s');
});

test('broken or replaced images and rejected decoding never become viewed', async () => {
  for (const change of ['el.imageViewer.naturalWidth=0', "el.imageViewer.src='replacement'", 'mediaSourceGeneration++', "document.visibilityState='hidden'"]) {
    const c = client();
    c.run(`beginMediaViewObservation();scheduleImageViewedPresentation(el.imageViewer);${change};`);
    await Promise.resolve(); await Promise.resolve(); c.paint(); c.paint(); c.run('runTimers()');
    assert.equal(c.run('viewed.length'), 0, change);
  }
  const c = client();
  c.run(`el.imageViewer.decode=()=>Promise.reject(new Error('bad image'));beginMediaViewObservation();scheduleImageViewedPresentation(el.imageViewer);`);
  await Promise.resolve(); await Promise.resolve(); c.paint(); c.paint(); c.run('runTimers()');
  assert.equal(c.run('viewed.length'), 0);
});

test('a file shown and left before the threshold counts as passed, once', async () => {
  const c = client();
  c.run(`beginMediaViewObservation();play(0,3);finishMediaViewObservation();finishMediaViewObservation();`);
  assert.equal(c.run('JSON.stringify(passed)'), '["fixture"]');
  const viewedFirst = client();
  viewedFirst.run(`el.videoPlayer.duration=4;beginMediaViewObservation();play(0,3);finishMediaViewObservation();`);
  assert.equal(viewedFirst.run('viewed.length + "," + passed.length'), '1,0');
  const neverShown = client();
  neverShown.run(`beginMediaViewObservation();noteViewedVideoPresentation(el.videoPlayer,0,'decoded-frame');finishMediaViewObservation();`);
  assert.equal(neverShown.run('passed.length'), 0, 'a first frame alone is not shown');
  const next = client();
  next.run(`beginMediaViewObservation();play(0,2);state.selected={id:'next'};state.mediaSession++;beginMediaViewObservation();`);
  assert.equal(next.run('JSON.stringify(passed)'), '["fixture"]', 'opening another file ends the previous one');
  const photo = client();
  photo.run(`beginMediaViewObservation();scheduleImageViewedPresentation(el.imageViewer);`);
  await Promise.resolve(); await Promise.resolve(); photo.paint(); photo.paint();
  photo.run('finishMediaViewObservation();runTimers();');
  assert.equal(photo.run('viewed.length + "," + passed.length'), '0,1');
});

test('automatic original retry continues the same viewing without double-recording', () => {
  for (const alreadyViewed of [false, true]) {
    const c = client();
    c.run(`state.selected.mimeType='video/mp4';el.videoPlayer.duration=10;beginMediaViewObservation();
      clearMediaSeekWatchdog=()=>{};clearMediaFrameWatchdog=()=>{};cancelVideoFrameSampling=()=>{};
      capturePlaybackSnapshot=()=>({paused:false});updateMediaDiagnosticSession=()=>{};
      clearDirectMediaSources=()=>{};setNativeVideoActionsAvailable=()=>{};updateQualityDisplay=()=>{};
      showMediaLoading=()=>{};sendTokenToWorker=()=>{};buildMediaUrl=()=>'/fixture';restorePlaybackSnapshot=()=>{};
      el.videoPlayer.load=()=>{};attemptCurrentPlayback=()=>{};`);
    c.run(alreadyViewed ? 'play(0,7);' : 'play(0,4);');
    assert.equal(c.run(`retryOriginalStream(state.selected,1,'fixture retry')`), true);
    assert.equal(c.run('mediaViewObservation.session'), c.run('state.mediaSession'));
    assert.equal(c.run('passed.length'), 0, 'a retry is not leaving the file');
    c.run(`play(4,8);`);
    assert.equal(c.run('viewed.length'), 1);
  }
});

test('foreground return resumes a background-loaded image with fresh paint evidence', async () => {
  const c = client();
  c.run(`beginMediaViewObservation();document.visibilityState='hidden';scheduleImageViewedPresentation(el.imageViewer);`);
  await Promise.resolve(); c.paint(); c.paint(); c.run('runTimers()');
  assert.equal(c.run('viewed.length'), 0);
  c.run(`document.visibilityState='visible';resumeMediaViewObservation();`);
  await Promise.resolve(); await Promise.resolve(); c.paint(); c.paint(); c.run('runTimers()');
  assert.equal(c.run('viewed.length'), 1);
});

test('frame sampling continues under the new generation after a seek', () => {
  const c = client();
  c.run(`globalThis.frameCallbacks=[];el.videoPlayer.requestVideoFrameCallback=fn=>frameCallbacks.push(fn);
    isCurrentMediaEvent=()=>true;noteMediaFrameProgress=()=>{};state.frameCallbackId=null;beginVideoFrameSampling();`);
  assert.equal(c.run('frameCallbacks.length'), 1);
  c.run(`mediaSeekGeneration++;frameCallbacks[0](0,{mediaTime:5});`);
  assert.equal(c.run('frameCallbacks.length'), 2, 'a stale-generation frame schedules the next sample');
  c.run(`state.mediaSession++;frameCallbacks[1](0,{mediaTime:6});`);
  assert.equal(c.run('frameCallbacks.length'), 2, 'another file stops sampling');
});
