'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function fixture() {
  const handlers = {};
  const c = { AbortController, Blob, DOMException, Headers, Map, Math, Promise, Response, Set, URL, URLSearchParams,
    console, fetch, performance, setTimeout, clearTimeout, setInterval, clearInterval, requestAnimationFrame() {},
    location: { href:'https://fixture.test/', origin:'https://fixture.test', pathname:'/', search:'' },
    navigator: { onLine:true }, localStorage: { getItem(){return null;},setItem(){},removeItem(){} },
    document: { addEventListener(type, handler){handlers[type]=handler;},querySelectorAll(){return [];} } };
  c.window = { location:c.location,addEventListener(){},matchMedia:()=>({matches:false}) };
  c.matchMedia = c.window.matchMedia;
  vm.createContext(c);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8'),c);
  const run = code=>vm.runInContext(code,c);
  run(`state.selected={id:'video'};state.mediaSession=3;state.mediaAttempt='range';
    el.mediaLoading={hidden:false,classList:{toggle(){}}};el.mediaError={hidden:true};el.mediaLoadingPercent={};
    el.mediaLoadingProgress={hidden:true,value:0,removeAttribute(){delete this.value;}};
    el.videoPlayer={hidden:false,dataset:{mediaSession:'3'},duration:100,currentTime:20,
      buffered:{length:1,start:()=>20,end:()=>21.5}};`);
  return {run,handlers};
}

test('full original saving shows measured byte percentage and always delivers completion', () => {
  const f=fixture();
  f.run("showMediaLoading();updateOriginalBufferProgress(25,100)");
  assert.equal(f.run('el.mediaLoadingPercent.textContent'),'25%');
  assert.equal(f.run('el.mediaLoadingPercent.hidden'),false);
  assert.equal(f.run('el.mediaLoadingProgress.value'),25);
  assert.equal(f.run('el.mediaLoadingProgress.hidden'),false);
  f.run("updateOriginalBufferProgress(100,100)");
  assert.equal(f.run('el.mediaLoadingPercent.textContent'),'100%');
  f.run("showMediaLoading();updateOriginalBufferProgress(10,0)");
  assert.equal(f.run('el.mediaLoadingPercent.textContent'),'');
  assert.equal(f.run('el.mediaLoadingPercent.hidden'),true);
  assert.equal(f.run('el.mediaLoadingProgress.hidden'),true);
  assert.equal(f.run('el.mediaLoadingProgress.value'),undefined);
});

test('range buffer percent measures only contiguous seconds ahead of the current position', () => {
  const f=fixture();f.run('updateNativeLoadingProgress()');
  assert.equal(f.run('el.mediaLoadingPercent.textContent'),'50%');
  f.run('el.videoPlayer.buffered={length:1,start:()=>80,end:()=>100};updateNativeLoadingProgress()');
  assert.equal(f.run('el.mediaLoadingPercent.textContent'),'0%','ranges elsewhere are not playback progress');
  f.run('el.videoPlayer.currentTime=99;el.videoPlayer.buffered={length:1,start:()=>99,end:()=>99.5};updateNativeLoadingProgress()');
  assert.equal(f.run('el.mediaLoadingPercent.textContent'),'50%','the target shrinks only at known EOF');
});

test('new loading phases clear prior percentage and stale, hidden or saving events cannot override it', () => {
  const f=fixture();f.run('updateNativeLoadingProgress();showMediaLoading()');
  assert.equal(f.run('el.mediaLoadingProgress.hidden'),true);
  assert.equal(f.run('el.mediaLoadingPercent.textContent'),'');
  assert.equal(f.run('el.mediaLoadingPercent.hidden'),true);
  for (const change of ["el.videoPlayer.dataset.mediaSession='2'",'el.videoPlayer.hidden=true',
    'el.mediaLoading.hidden=true',"state.mediaAttempt='blob-loading'"]) {
    const f=fixture();f.run(`showMediaLoading();${change};updateNativeLoadingProgress()`);
    assert.equal(f.run('el.mediaLoadingPercent.textContent'),'');
    assert.equal(f.run('el.mediaLoadingProgress.hidden'),true);
  }
});

test('mobile and desktop time displays share the mapped original timeline', () => {
  const f=fixture();
  f.run(`el.ctrlCurrentTime={};el.ctrlTotalTime={};el.mobileCurrentTime={};el.mobileTotalTime={};
    playerTimeline=()=>({currentTime:75,duration:300});onVideoProgressUpdate=()=>{};updateVideoProgress()`);
  assert.equal(f.run('el.mobileCurrentTime.textContent'),'1:15');
  assert.equal(f.run('el.mobileTotalTime.textContent'),'5:00');
  assert.equal(f.run('el.mobileCurrentTime.textContent===el.ctrlCurrentTime.textContent'),true);
  assert.equal(f.run('el.mobileTotalTime.textContent===el.ctrlTotalTime.textContent'),true);
});

test('progress reads one mapped timeline, avoids layout measurement and skips unchanged DOM writes', () => {
  const f=fixture();
  f.run(`let timelineReads=0,sourceTimeReads=0,textWrites=0,ariaWrites=0,styleWrites=0;
    q1Playback={kind:'general',player:{stats(){timelineReads++;return {mapping:{sourceOrigin:5,sourceEnd:305,commonShift:2}};},
      sourceTime(){sourceTimeReads++;return 80;}}};
    function textNode(){let value='';return {get textContent(){return value;},set textContent(next){textWrites++;value=next;}};}
    for(const name of ['ctrlCurrentTime','ctrlTotalTime','mobileCurrentTime','mobileTotalTime'])el[name]=textNode();
    function track(){const attrs=new Map();return {getAttribute:name=>attrs.get(name),setAttribute(name,value){ariaWrites++;attrs.set(name,value);},
      get clientWidth(){throw Error('timeline updates must not force layout');}};}
    el.seekBarContainer=track();el.mobileShortsProgressTrack=track();
    const props=new Map();el.seekBarThumb={style:{getPropertyValue:name=>props.get(name),setProperty(name,value){styleWrites++;props.set(name,value);}}};
    el.seekBarBuffered={style:{}};updateVideoProgress();
    globalThis.firstWrites=JSON.stringify({textWrites,ariaWrites,styleWrites});updateVideoProgress();`);
  assert.equal(f.run('timelineReads'),2,'each update takes one coherent mapping snapshot');
  assert.equal(f.run('sourceTimeReads'),2);
  assert.equal(f.run('JSON.stringify({textWrites,ariaWrites,styleWrites})'),f.run('firstWrites'));
  assert.equal(f.run("el.seekBarThumb.style.getPropertyValue('--seek-position')"),'25%');
  assert.equal(f.run('el.seekBarBuffered.style.transform'),`scaleX(${18.5/300})`);
  assert.equal(f.run('el.ctrlCurrentTime.textContent'),'1:15');
});

test('library options preserves contained actions and closes outside or on Escape with focus return', () => {
  const f=fixture();f.run(`let focused=0;
    el.libraryOptions={open:true,contains:target=>target==='inside',querySelector:()=>({focus:()=>focused++})};
    setupLibraryOptions()`);
  f.handlers.click({target:'inside'});assert.equal(f.run('el.libraryOptions.open'),true);
  f.handlers.click({target:'outside'});assert.equal(f.run('el.libraryOptions.open'),false);
  f.run('el.libraryOptions.open=true');let prevented=false;
  f.handlers.keydown({key:'Escape',preventDefault(){prevented=true;}});
  assert.equal(prevented,true);assert.equal(f.run('el.libraryOptions.open'),false);assert.equal(f.run('focused'),1);
});
