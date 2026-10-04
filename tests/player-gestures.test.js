'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

function fixture() {
  const timers = new Map(); let nextTimer = 0;
  const modal = new EventTarget();
  modal.closest = () => null;
  const context = { AbortController, Blob, DOMException, Headers, Map, Math, Promise, Response, Set, URL, URLSearchParams,
    console, performance, fetch, clearInterval, setInterval,
    setTimeout(fn, delay) { const id = ++nextTimer; timers.set(id, { fn, delay }); return id; },
    clearTimeout(id) { timers.delete(id); }, requestAnimationFrame() {},
    location: { href: 'https://fixture.test/', origin: 'https://fixture.test', pathname: '/', search: '' },
    navigator: { onLine: true }, localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    document: { addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; } }, modal };
  context.window = { addEventListener() {}, removeEventListener() {}, innerWidth: 400, innerHeight: 800,
    location: context.location, matchMedia: () => ({ matches: false }) };
  context.matchMedia = context.window.matchMedia;
  vm.createContext(context); vm.runInContext(source, context);
  const run = script => vm.runInContext(script, context);
  run(`let clock=1000;Date.now=()=>clock;
    const classes=new Set(['controls-idle']);
    modal.classList={contains:n=>classes.has(n),add:n=>classes.add(n),remove:n=>classes.delete(n)};
    el.playerModal=modal;el.playerSheet={hidden:false};
    el.mediaStage={clientWidth:400,clientHeight:800,contains:()=>true,classList:{add(){},remove(){}},
      getBoundingClientRect:()=>({left:0,top:0,width:400,height:800})};
    el.videoPlayer={hidden:false};state.mediaAttempt='range';
    let pauses=0,likes=0,seeks=[],navigations=[];
    togglePlayPause=()=>pauses++;toggleFavoriteForSelected=()=>likes++;
    seekRelative=n=>seeks.push(n);flashSeekHint=()=>{};
    setPlayerChromeVisible=on=>{if(on)classes.delete('controls-idle');else classes.add('controls-idle');};
    let reveals=0;revealPlayerChrome=()=>{reveals++;classes.delete('controls-idle');};
    clearMediaTransition=()=>{};getActiveMediaElement=()=>null;snapBackSpring=()=>{};
    getPlaybackFileById=()=>null;resolveSwipeTarget=()=>({id:'next'});
    hasCompletePlaybackPopulation=()=>true;playFrozenSwipeTarget=(id,dir)=>{navigations.push(dir);return Promise.resolve();};
    restoreDraggedMediaPosition=()=>{};setupTouchGestures();`);
  function dispatch(type, x=200, y=400, { count=1, identifier=1, cancelable=true, control=false }={}) {
    const event = new Event(type, { cancelable });
    const touch = { clientX:x, clientY:y, identifier };
    Object.defineProperties(event, { touches: { value: Array.from({ length:count }, () => touch) }, changedTouches: { value:[touch] } });
    modal.closest = () => control ? {} : null;
    modal.dispatchEvent(event);
    return event;
  }
  function flush() {
    for (const [id, timer] of [...timers]) { timers.delete(id); timer.fn(); }
  }
  return { run, dispatch, flush, timers, modal };
}

test('central play/pause stays square in portrait and landscape and rejects outside geometry', () => {
  const f=fixture();
  for (const [x,y,zone] of [[88,288,'center'],[312,512,'center'],[87,400,'left'],[313,400,'right'],[200,287,'top'],[200,513,'bottom'],[10,10,'top'],[390,790,'bottom']]) {
    assert.equal(f.run(`getTapZone(${x},${y})`),zone);
  }
  assert.equal(f.run('getTapZone(-1,400)'),null);
  f.run('el.mediaStage.getBoundingClientRect=()=>({left:0,top:0,width:800,height:400})');
  for (const [x,y,zone] of [[288,88,'center'],[512,312,'center'],[287,200,'left'],[513,200,'right'],[400,87,'top'],[400,313,'bottom']]) {
    assert.equal(f.run(`getTapZone(${x},${y})`),zone);
  }
  assert.equal(f.run('el.mediaStage.getBoundingClientRect=()=>({width:0,height:0});getTapZone(0,0)'),null);
});

test('dispatched single touch only pauses in the central region; outer taps do not', () => {
  const f=fixture();
  for (const [x,y] of [[60,400],[340,400],[200,100],[200,700],[10,10],[390,10],[10,790],[390,790]]) {
    f.dispatch('touchstart',x,y); f.dispatch('touchend',x,y); f.flush(); f.run('clock+=400');
  }
  assert.equal(f.run('pauses'),0);
  assert.equal(f.run('reveals'),4,'successive outside taps alternate reveal and hide');
  assert.equal(f.run("classes.has('controls-idle')"),true,'four reveal/hide pairs end hidden');
  const start=f.dispatch('touchstart'),end=f.dispatch('touchend');f.flush();
  assert.equal(start.defaultPrevented,true);assert.equal(end.defaultPrevented,true);assert.equal(f.run('pauses'),1);
});

test('center toggles playback with visible chrome and never forces hidden chrome open', () => {
  const f=fixture();f.run("classes.delete('controls-idle')");
  f.dispatch('touchstart');f.dispatch('touchend');f.flush();
  assert.equal(f.run('pauses'),1);assert.equal(f.run("classes.has('controls-idle')"),false);
  f.run("clock+=400;classes.add('controls-idle')");f.dispatch('touchstart');f.dispatch('touchend');f.flush();
  assert.equal(f.run('pauses'),2);assert.equal(f.run("classes.has('controls-idle')"),true);
});

test('central pairs favorite once; lateral edge pairs seek; top/bottom pairs do neither', () => {
  const f=fixture();
  for (const [x,y] of [[200,400],[60,400],[340,400],[200,100],[200,700],[10,10],[390,790]]) {
    f.dispatch('touchstart',x,y);f.dispatch('touchend',x,y);f.run('clock+=100');
    f.dispatch('touchstart',x,y);f.dispatch('touchend',x,y);f.flush();f.run('clock+=400');
  }
  assert.equal(f.run('likes'),1);assert.equal(f.run('JSON.stringify(seeks)'),JSON.stringify([-10,10]));assert.equal(f.run('pauses'),0);
});

test('nearby contacts across a zone boundary cannot become a favorite pair', () => {
  const f=fixture();f.run('handleStageTap(87,400);clock+=100;handleStageTap(89,400)');f.flush();
  assert.equal(f.run('likes'),0);assert.equal(f.run('pauses'),1);
});

test('vertical shorts swipe cancels pending tap and navigates once without pause', () => {
  const f=fixture();f.dispatch('touchstart');f.dispatch('touchend');f.run('clock+=80');
  f.dispatch('touchstart');f.dispatch('touchmove',200,320);f.dispatch('touchend',200,280);f.flush();
  assert.equal(f.run('JSON.stringify(navigations)'),JSON.stringify(['up']));assert.equal(f.run('pauses'),0);assert.equal(f.run('likes'),0);
});

test('reserved corner taps reveal controls without stealing native back movement or cancellation', () => {
  const f=fixture();
  const start=f.dispatch('touchstart',5,10),end=f.dispatch('touchend',5,10);
  assert.equal(start.defaultPrevented,false);assert.equal(end.defaultPrevented,false);
  assert.equal(f.run('reveals'),1);assert.equal(f.run('pauses'),0);
  for (const cancel of [f=>f.dispatch('touchmove',40,10),f=>f.dispatch('touchcancel'),
    f=>f.dispatch('touchstart',5,10,{count:2}),f=>f.run('state.mediaSession++')]) {
    f.dispatch('touchstart',5,10);cancel(f);f.dispatch('touchend',5,10);f.flush();
    assert.equal(f.run('reveals'),1);assert.equal(f.run('pauses'),0);assert.equal(f.run('JSON.stringify(navigations)'),'[]');
  }
});

test('controls, multi-touch, OS cancellation, changed session and mismatched contact cancel pending tap', () => {
  for (const cancel of [f=>f.dispatch('touchstart',200,400,{control:true}),f=>f.dispatch('touchstart',200,400,{count:2}),
    f=>f.dispatch('touchcancel'),f=>{f.dispatch('touchstart');f.run('state.mediaSession++');f.dispatch('touchend');},
    f=>{f.dispatch('touchstart');f.dispatch('touchend',200,400,{identifier:2});}]) {
    const f=fixture();f.dispatch('touchstart');f.dispatch('touchend');cancel(f);f.flush();
    assert.equal(f.run('pauses'),0);assert.equal(f.run('likes'),0);assert.equal(f.run('isTouchActive'),false);
  }
});

test('mouse clicks share the central and pair contract; controls stay outside it', () => {
  const f=fixture();f.modal.addEventListener('click',event=>f.run(`onMediaStageClick({target:modal,clientX:${event.clientX},clientY:${event.clientY},sourceCapabilities:{firesTouchEvents:false}})`));
  function click(x,y) { const event=new Event('click');Object.defineProperties(event,{clientX:{value:x},clientY:{value:y}});f.modal.closest=()=>null;f.modal.dispatchEvent(event); }
  click(200,100);f.flush();assert.equal(f.run('pauses'),0);f.run('clock+=400');
  click(200,400);f.run('clock+=100');click(200,400);f.flush();assert.equal(f.run('likes'),1);assert.equal(f.run('pauses'),0);
  f.run('clock+=400');click(200,400);f.flush();assert.equal(f.run('pauses'),1);
  f.modal.closest=()=>({});f.run('onMediaStageClick({target:modal,clientX:200,clientY:400})');f.flush();assert.equal(f.run('pauses'),1);
});

test('bottom reveal and reserved back clicks cannot leave a central tap pending', () => {
  for (const [x,y,touchLike] of [[200,790,false],[5,400,true]]) {
    const f=fixture();
    f.run('el.playerControlsEntry={getBoundingClientRect:()=>({left:0,right:400,top:780,bottom:800})};');
    f.run(`onMediaStageClick({target:modal,clientX:200,clientY:400,sourceCapabilities:{firesTouchEvents:false}});clock+=100;
      isMobileDevice=()=>true;onMediaStageClick({target:modal,clientX:${x},clientY:${y},sourceCapabilities:{firesTouchEvents:${touchLike}}});`);
    f.flush();assert.equal(f.run('pauses'),0);assert.equal(f.run('singleTapTimer'),null);
  }
});
