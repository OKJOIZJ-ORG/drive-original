'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
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
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8'), c);
  c.run = code => vm.runInContext(code, c);
  c.paint = () => { for (const fn of frames.splice(0)) fn(); };
  c.run(`state.selected={id:'fixture'};state.accountId='account-A';state.authAccountKey='account-A';
    state.accountIdentityPending=false;state.mediaAttempt='range';state.mediaSession=1;
    el.playerSheet={hidden:false};el.mediaError={hidden:true};
    const viewed=[];markFileViewed=id=>viewed.push(id);
    el.videoPlayer={hidden:false,paused:false,seeking:false,readyState:2,currentTime:0,dataset:{mediaSession:'1'}};
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

test('video viewed requires presentation progress, not an open, paused frame or seek', () => {
  const c = client();
  c.run('beginMediaViewObservation();');
  assert.equal(c.run('viewed.length'), 0);
  c.run(`noteViewedVideoPresentation(el.videoPlayer,0,'decoded-frame');`);
  assert.equal(c.run('viewed.length'), 0);
  c.run(`el.videoPlayer.paused=true;noteViewedVideoPresentation(el.videoPlayer,5,'decoded-frame');`);
  assert.equal(c.run('viewed.length'), 0);
  c.run(`el.videoPlayer.paused=false;el.videoPlayer.seeking=true;noteViewedVideoPresentation(el.videoPlayer,6,'decoded-frame');`);
  assert.equal(c.run('viewed.length'), 0);
  c.run(`el.videoPlayer.seeking=false;noteViewedVideoPresentation(el.videoPlayer,6,'decoded-frame');noteViewedVideoPresentation(el.videoPlayer,6.04,'decoded-frame');`);
  assert.equal(c.run('viewed.length'), 1);
  c.run(`noteViewedVideoPresentation(el.videoPlayer,6.08,'decoded-frame');`);
  assert.equal(c.run('viewed.length'), 1);
});

test('hidden, failed, stale-session and account-switched videos cannot write viewed state', () => {
  for (const change of ["document.visibilityState='hidden'", 'el.playerSheet.hidden=true', 'el.mediaError.hidden=false', 'state.mediaSession++', "state.accountId='account-B'", 'state.driveSessionGeneration++']) {
    const c = client();
    c.run(`beginMediaViewObservation();noteViewedVideoPresentation(el.videoPlayer,0,'decoded-frame');${change};noteViewedVideoPresentation(el.videoPlayer,.04,'decoded-frame');`);
    assert.equal(c.run('viewed.length'), 0, change);
  }
});

test('source and seek generations cannot combine presentation observations', () => {
  for (const change of ['mediaSourceGeneration++', 'mediaSeekGeneration++']) {
    const c = client();
    c.run(`beginMediaViewObservation();noteViewedVideoPresentation(el.videoPlayer,0,'decoded-frame');${change};noteViewedVideoPresentation(el.videoPlayer,50,'decoded-frame');`);
    assert.equal(c.run('viewed.length'), 0);
    c.run(`noteViewedVideoPresentation(el.videoPlayer,50.04,'decoded-frame');`);
    assert.equal(c.run('viewed.length'), 1);
  }
});

test('image viewed waits for decode and paint, and rejects stale decode completion', async () => {
  const c = client();
  c.run(`beginMediaViewObservation();scheduleImageViewedPresentation(el.imageViewer);`);
  await Promise.resolve(); await Promise.resolve();
  assert.equal(c.run('viewed.length'), 0);
  c.paint(); assert.equal(c.run('viewed.length'), 0);
  c.paint(); assert.equal(c.run('viewed.length'), 1);
  const stale = client();
  stale.run(`let release;el.imageViewer.decode=()=>new Promise(resolve=>release=resolve);beginMediaViewObservation();scheduleImageViewedPresentation(el.imageViewer);state.accountId='account-B';release();`);
  await Promise.resolve(); await Promise.resolve(); stale.paint(); stale.paint();
  assert.equal(stale.run('viewed.length'), 0);
});

test('broken or replaced images and rejected decoding never become viewed', async () => {
  for (const change of ['el.imageViewer.naturalWidth=0', "el.imageViewer.src='replacement'", 'mediaSourceGeneration++', "document.visibilityState='hidden'"]) {
    const c = client();
    c.run(`beginMediaViewObservation();scheduleImageViewedPresentation(el.imageViewer);${change};`);
    await Promise.resolve(); await Promise.resolve(); c.paint(); c.paint();
    assert.equal(c.run('viewed.length'), 0, change);
  }
  const c = client();
  c.run(`el.imageViewer.decode=()=>Promise.reject(new Error('bad image'));beginMediaViewObservation();scheduleImageViewedPresentation(el.imageViewer);`);
  await Promise.resolve(); await Promise.resolve(); c.paint(); c.paint();
  assert.equal(c.run('viewed.length'), 0);
});

test('automatic original retry rebinds viewed ownership without double-recording', () => {
  for (const alreadyViewed of [false, true]) {
    const c = client();
    c.run(`state.selected.mimeType='video/mp4';beginMediaViewObservation();
      clearMediaSeekWatchdog=()=>{};clearMediaFrameWatchdog=()=>{};cancelVideoFrameSampling=()=>{};
      capturePlaybackSnapshot=()=>({paused:false});updateMediaDiagnosticSession=()=>{};
      clearDirectMediaSources=()=>{};setNativeVideoActionsAvailable=()=>{};updateQualityDisplay=()=>{};
      showMediaLoading=()=>{};sendTokenToWorker=()=>{};buildMediaUrl=()=>'/fixture';restorePlaybackSnapshot=()=>{};
      el.videoPlayer.load=()=>{};attemptCurrentPlayback=()=>{};`);
    if (alreadyViewed) c.run(`noteViewedVideoPresentation(el.videoPlayer,0,'decoded-frame');noteViewedVideoPresentation(el.videoPlayer,.04,'decoded-frame');`);
    assert.equal(c.run(`retryOriginalStream(state.selected,1,'fixture retry')`), true);
    assert.equal(c.run('mediaViewObservation.session'), c.run('state.mediaSession'));
    c.run(`noteViewedVideoPresentation(el.videoPlayer,1,'decoded-frame');noteViewedVideoPresentation(el.videoPlayer,1.04,'decoded-frame');`);
    assert.equal(c.run('viewed.length'), 1);
  }
});

test('foreground return resumes a background-loaded image with fresh paint evidence', async () => {
  const c = client();
  c.run(`beginMediaViewObservation();document.visibilityState='hidden';scheduleImageViewedPresentation(el.imageViewer);`);
  await Promise.resolve(); c.paint(); c.paint();
  assert.equal(c.run('viewed.length'), 0);
  c.run(`document.visibilityState='visible';resumeMediaViewObservation();`);
  await Promise.resolve(); await Promise.resolve(); c.paint(); c.paint();
  assert.equal(c.run('viewed.length'), 1);
});
