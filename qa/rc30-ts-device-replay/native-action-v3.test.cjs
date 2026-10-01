'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{execFileSync}=require('node:child_process');
const driver=fs.readFileSync(path.join(__dirname,'android-same-file-replay-v3.cjs'),'utf8');
const closures=driver.slice(driver.indexOf('  const controls=async()=>'),driver.indexOf('  const seek=async('));
const app=execFileSync('git',['show','aa46bd083ce8c21f55cf7d9a4759f0d6709188c2:app.js'],{cwd:path.resolve(__dirname,'../..'),encoding:'utf8',maxBuffer:2*1024*1024});
const stageHandler=app.slice(app.indexOf('function handleStageTap('),app.indexOf('function setupTouchGestures()',app.indexOf('function handleStageTap(')));
function fixture(idle=true,transport=false){
 let now=100000,timer=null,likes=0,paused=false;const actions=[],steps=[];
 const context={state:{mediaSession:1},lastTapTime:0,lastTapX:0,lastTapY:0,singleTapTimer:null,
  el:{playerSheet:{hidden:false},playerModal:{classList:{contains:()=>idle}},mediaStage:{getBoundingClientRect:()=>({left:0,width:824})},videoPlayer:{hidden:false}},
  Date:{now:()=>now},Math,navigator:{vibrate:()=>{}},getTapZone:()=> 'center',resolveMediaDoubleTapAction:()=> 'favorite',
  toggleFavoriteForSelected:()=>likes++,togglePlayPause:()=>{paused=!paused;},setPlayerChromeVisible:v=>{idle=!v;},seekRelative:()=>{},flashSeekHint:()=>{},
  setTimeout:fn=>(timer=fn,1),clearTimeout:()=>{timer=null;},
  read:async()=>({latest:{native:{paused},sourceSame:true,accountSame:true,targetSame:true,route:'Q1_TS'}}),
  geometry:async key=>({key,available:key==='ctrlPlayPause'?transport:key==='seekBarContainer'?!idle:key==='playerControlsEntry'?idle:true,controlsIdle:idle}),
  evaluate:async()=>idle,c:{wait:async ms=>{now+=ms;},step:(name,data)=>steps.push({name,...data})},fail:code=>{throw Error(code);}};
 vm.createContext(context);vm.runInContext(stageHandler,context);
 context.tap=async key=>{actions.push(key);if(key==='mediaStage'){context.handleStageTap(412,500);now+=650;const fn=timer;timer=null;fn?.();}
  else if(key==='ctrlPlayPause'){paused=!paused;now+=650;}else if(key==='playerControlsEntry'){idle=false;now+=650;}};
 vm.runInContext(closures+';globalThis.api={controls,pause};',context);
 return{context,api:context.api,actions,steps,paused:()=>paused,idle:()=>idle,likes:()=>likes};
}
test('actual rc30 stage handler pauses from idle using one spaced native action',async()=>{
 const f=fixture(true,false);await f.api.pause(true);assert.equal(f.paused(),true);assert.deepEqual(f.actions,['mediaStage']);assert.equal(f.likes(),0);assert.equal(f.idle(),true);
});
test('visible chrome dismisses first, then pauses; spaced taps do not double-tap favorite',async()=>{
 const f=fixture(false,false);await f.api.pause(true);assert.deepEqual(f.actions,['mediaStage','mediaStage']);assert.equal(f.paused(),true);assert.equal(f.likes(),0);
 assert.equal(f.steps[0].actualPaused,false);assert.equal(f.steps[1].actualPaused,true);
});
test('an accessible normal transport button avoids unnecessary stage taps',async()=>{
 const f=fixture(false,true);await f.api.pause(true);assert.deepEqual(f.actions,['ctrlPlayPause']);assert.equal(f.paused(),true);
});
test('entry reveal is a separate normal action and leaves paused state alone',async()=>{
 const f=fixture(true,false);await f.api.pause(true);await f.api.controls();assert.deepEqual(f.actions,['mediaStage','playerControlsEntry']);assert.equal(f.paused(),true);assert.equal(f.idle(),false);
});
test('a covered entry with unavailable seek dismisses chrome before revealing; no playback toggle',async()=>{
 const f=fixture(false,false);const geometry=f.context.geometry;let revealed=false;
 f.context.geometry=async key=>key==='seekBarContainer'?{available:revealed,controlsIdle:f.idle()}:geometry(key);
 const tap=f.context.tap;f.context.tap=async key=>{await tap(key);if(key==='playerControlsEntry')revealed=true;};
 await f.api.controls();assert.deepEqual(f.actions,['mediaStage','playerControlsEntry']);assert.equal(f.paused(),false);assert.equal(f.likes(),0);
});
test('unavailable stage/native entry preserves fixed failures and bounded adaptation',async()=>{
 const f=fixture(true,false);f.context.geometry=async key=>({key,available:false,controlsIdle:true});
 await assert.rejects(f.api.controls(),/NATIVE_ENTRY_UNAVAILABLE/);assert.equal(f.actions.length,0);
});
