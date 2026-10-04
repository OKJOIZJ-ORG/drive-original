'use strict';
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const test = require('node:test'), assert = require('node:assert/strict');
const fixture = {exports: {}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'app.test.js'), 'utf8').split('\ntest(')[0]
  + '\nmodule.exports=loadAppContext;', {require, __dirname, module: fixture,
    AbortController, Blob, DOMException, Headers, Map, Math, Promise, Response, Set, URL, URLSearchParams,
    clearInterval, clearTimeout, console, fetch, performance, setInterval, setTimeout});
const run = (c, code) => vm.runInContext(code, c);

function ui() {
  const c = fixture.exports();
  run(c, `const node=()=>({textContent:'',hidden:false,dataset:{},attributes:{},setAttribute(k,v){this.attributes[k]=v;}});
    for(const id of ['topbarPrevBtn','ctrlPrevVideo','topbarNextBtn','ctrlNextVideo','topbarRandomBtn','ctrlRandomShorts',
      'ctrlSpeedText','playerQuality','mediaResolution','qualityBadge','streamModeLabel','streamModeText','mediaStage'])el[id]=node();
    el.playerControlsEntry={...node(),caption:node(),querySelector(){return this.caption;}};
    el.videoPlayer={hidden:false,videoWidth:960,videoHeight:540,playbackRate:1};
    el.imageViewer={hidden:true,naturalWidth:0,naturalHeight:0};
    state.selected={id:'fixture',mimeType:'video/mp4',videoMediaMetadata:{width:1920,height:1080}};
    state.demo=false;state.mediaAttempt='original-playing';state.mediaTransportVerified=true;
    state.mediaPlaybackMode=PLAYBACK_MODE.RANGE;`);
  return c;
}

test('speed label and radio choice follow the actual playback rate, including a rate outside presets', () => {
  const c = ui();
  run(c, `globalThis.buttons=[.5,1,1.5,2].map(speed=>({dataset:{speed:String(speed)},active:false,attributes:{},
    classList:{toggle(_name,active){this.owner.active=active;}},setAttribute(k,v){this.attributes[k]=v;}}));
    buttons.forEach(b=>b.classList.owner=b);el.speedDropdown={querySelectorAll:()=>buttons};`);
  for (const rate of [1.5, 2, 1.1, .5]) {
    run(c, `el.videoPlayer.playbackRate=${rate};updateSpeedUI();`);
    assert.equal(run(c, 'el.ctrlSpeedText.textContent'), `${rate}×`);
    assert.deepEqual(Array.from(c.buttons, b=>[b.active,b.attributes['aria-checked']]),
      [.5,1,1.5,2].map(n=>[n===rate,String(n===rate)]));
  }
});

test('previous, next and random labels change with the presented media type in both control groups', () => {
  const c = ui();
  for (const [mime,noun] of [['video/mp4','영상'],['image/png','이미지'],['video/webm','영상']]) {
    run(c, `state.selected.mimeType='${mime}';updatePlayerNavigationLabels(state.selected);`);
    const controlsLabel = `${noun==='영상'?'재생':'이미지'} 제어 열기`;
    assert.equal(run(c, 'el.playerControlsEntry.attributes["aria-label"]'), controlsLabel);
    assert.equal(run(c, 'el.playerControlsEntry.caption.textContent'), controlsLabel);
    const stageLabel = run(c, 'el.mediaStage.attributes["aria-label"]');
    assert.equal(stageLabel.includes('Space:'), noun==='영상');
    assert.match(stageLabel, new RegExp(`^${noun} 화면`));
    for (const [ids,verb] of [[['topbarPrevBtn','ctrlPrevVideo'],'이전'],[['topbarNextBtn','ctrlNextVideo'],'다음'],[['topbarRandomBtn','ctrlRandomShorts'],'랜덤']]) {
      const expected = `${verb} ${noun}${verb==='랜덤'&&noun==='영상'?' (쇼츠)':''}`;
      for (const id of ids) assert.equal(run(c, `el.${id}.title`), expected), assert.equal(run(c, `el.${id}.attributes['aria-label']`), expected);
    }
  }
});

test('compact quality reports actual live dimensions and honest source labels for every playback route', () => {
  const modes = [['RANGE','원본'],['REPACKAGED','원본'],['MEMORY','원본'],['OPFS','원본'],
    ['SEQUENTIAL','원본'],['AUDIO_COMPATIBILITY','영상 원본'],['VIDEO_COMPATIBILITY','호환 변환'],['COMPATIBILITY','미확인']];
  for (const [mode,label] of modes) {
    const c = ui();run(c, `state.mediaPlaybackMode=PLAYBACK_MODE.${mode};updateQualityDisplay();`);
    assert.equal(run(c, 'el.playerQuality.textContent'), `${label} · 540p`, mode);
  }
  for (const change of ['state.demo=true', "state.mediaAttempt='drive-preview-playing'", 'state.mediaTransportVerified=false']) {
    const c = ui();run(c, `${change};updateQualityDisplay();`);
    assert.equal(run(c, 'el.playerQuality.textContent'), '미확인 · 540p', change);
  }
});

test('unknown transformed or preview output dimensions cannot borrow the stored original dimensions', () => {
  for (const change of ['state.mediaPlaybackMode=PLAYBACK_MODE.VIDEO_COMPATIBILITY',
    'state.mediaPlaybackMode=PLAYBACK_MODE.COMPATIBILITY', 'state.demo=true',
    "state.mediaAttempt='drive-preview-playing'", 'state.mediaTransportVerified=false']) {
    const c = ui();run(c, `${change};el.videoPlayer.videoWidth=el.videoPlayer.videoHeight=0;updateQualityDisplay();`);
    assert.doesNotMatch(run(c, 'el.playerQuality.textContent'), /\d+p/, change);
  }
});

test('partial live and metadata dimension pairs are never combined into a guessed resolution', () => {
  const c = ui();run(c, 'el.videoPlayer.videoWidth=960;el.videoPlayer.videoHeight=0;state.selected.videoMediaMetadata={width:0,height:1080};updateQualityDisplay();');
  assert.equal(run(c, 'el.playerQuality.textContent'), '원본');
  const known = ui();run(known, 'el.videoPlayer.videoWidth=el.videoPlayer.videoHeight=0;updateQualityDisplay();');
  assert.equal(run(known, 'el.playerQuality.textContent'), '원본 · 1080p', 'complete verified-original metadata is a known source dimension pair');
});

test('image presentation refreshes navigation and hides the compact video quality label', () => {
  const c = ui();run(c, "state.selected={id:'image',mimeType:'image/png'};el.videoPlayer.hidden=true;el.imageViewer.hidden=false;el.imageViewer.naturalWidth=800;el.imageViewer.naturalHeight=600;updateQualityDisplay();");
  assert.equal(run(c, 'el.playerQuality.hidden'), true);assert.equal(run(c, 'el.ctrlNextVideo.title'), '다음 이미지');
  assert.match(run(c, 'el.mediaResolution.textContent'), /800 × 600/);
});
