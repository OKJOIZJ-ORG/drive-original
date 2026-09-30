'use strict';
// Local bounded mock checks only. No browser, network or product script execution.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const read=name=>fs.readFileSync(path.join(__dirname,name+'.expression.js'),'utf8');
const secret='PRIVATE_SENTINEL';
const fixture=(closed=false)=>{
  const timers=new Map(),intervals=new Map(),listeners=new Map(),frames=new Map();let next=1,gen=4,now=1000;
  const video={paused:true,duration:1609.408,currentTime:160.94,readyState:4,seeking:false,
    requestVideoFrameCallback:fn=>{const id=next++;frames.set(id,fn);return id;},
    cancelVideoFrameCallback:id=>frames.delete(id),
    addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:(name,fn)=>{if(listeners.get(name)===fn)listeners.delete(name);}};
  const player={stats:()=>({generation:gen,phase:'ready',target:804.704,appends:5,frames:8})};
  const resource=(name,startTime)=>({name,startTime,duration:12,responseStart:0,responseEnd:startTime+12,
    workerStart:0,transferSize:0,encodedBodySize:0});
  const entries=[resource('https://www.googleapis.com/drive/v3/files/'+secret+'?fields=size&token='+secret,900),
    resource('https://qa.invalid/__drive_media/'+secret+'?mediaOwner=q1&mediaSession=7&sourceGeneration=9&resourceKey='+secret,920),
    resource('https://qa.invalid/__drive_media/'+secret+'?mediaOwner=q1&mediaSession=7&sourceGeneration=10&resourceKey='+secret,950),
    resource('https://qa.invalid/__drive_media/OTHER_PRIVATE?mediaOwner=q0&mediaSession=7&sourceGeneration=10',970)];
  class Observer{constructor(callback){this.callback=callback;this.queue=[];this.disconnected=false;observers.push(this);}observe(){}takeRecords(){return this.queue.splice(0);}disconnect(){this.disconnected=true;}}
  const observers=[];
  const docListeners=new Map();const track={contains:t=>t==='TRACK'};
  const env={APP_VERSION:"1.22.0-rc.19",window:{},URL,location:{origin:'https://qa.invalid'},performance:{now:()=>now,getEntriesByType:()=>entries},
    document:{addEventListener:(name,fn)=>docListeners.set(name,fn),removeEventListener:(name,fn)=>{if(docListeners.get(name)===fn)docListeners.delete(name);}},
    PerformanceObserver:Observer,state:{selected:closed?null:{id:secret},authAccountKey:secret,accountId:secret,driveSessionGeneration:9,mediaSession:7,isSeeking:false},
    el:{videoPlayer:video,seekBarContainer:track,mediaLoading:{hidden:true}},q1Playback:{kind:'ts',player},isCurrentMediaEvent:()=>!closed,
    mediaDiagnosticTrace:null,mediaDiagnosticRetiredTraces:new Map(),mediaSeekWatchdog:null,
    mediaSourceGeneration:10,
    setTimeout:(fn,ms)=>{const id=next++;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id),
    setInterval:fn=>{const id=next++;intervals.set(id,fn);return id;},clearInterval:id=>intervals.delete(id)};
  vm.createContext(env);
  return {env,video,player,entries,timers,intervals,listeners,frames,observers,docListeners,
    generation:value=>{gen=value;},time:value=>{now=value;},
    run:name=>vm.runInContext(read(name),env),assertClean:()=>{
      assert.equal(frames.size,0);assert.equal(timers.size,0);assert.equal(intervals.size,0);assert.equal(listeners.size,0);assert.equal(docListeners.size,0);
      assert(observers.every(o=>o.disconnected));assert.equal(env.window.__rc19LatencyQA,undefined);}};
};
let checks=0;
for(const closed of [false,true]){
  const f=fixture(closed),r=f.run('retrospective-resources');
  assert.equal(r.rows.length,3);assert.equal(r.rows[0].stage,'metadata');
  assert.equal(r.rows[0].headersMs,null);assert.equal(r.rows[1].mostRecentRangeGeneration,false);
  assert.equal(r.rows[2].mostRecentRangeGeneration,true);assert(!JSON.stringify(r).includes(secret));checks++;
}
{
  const f=fixture(),r=f.run('availability');assert.equal(r.traceAvailable,false);assert.equal(r.traceStoresEvents,false);
  assert(!JSON.stringify(r).includes(secret));checks++;
}
{
  const f=fixture();f.run('future-arm');assert.equal(f.frames.size,1);
  // A prior target frame before trusted input is not accepted as a new seek.
  let [id,fn]=[...f.frames][0];f.frames.delete(id);fn(0,{mediaTime:804.704,presentedFrames:10});
  assert.equal(f.env.window.__rc19LatencyQA.read().rows.some(r=>r.stage==='target-frame'),false);
  f.time(1100);f.docListeners.get('pointerdown')({isTrusted:true,target:'TRACK'});
  f.generation(5);f.time(1300);f.video.seeking=true;
  [id,fn]=[...f.frames][0];f.frames.delete(id);fn(0,{mediaTime:804.721333,presentedFrames:14});
  // A target frame must not complete while the real seek remains pending.
  assert.equal(f.env.window.__rc19LatencyQA.read().done,false);
  assert.equal([...f.timers.values()].some(v=>v.ms===300),false);
  f.video.seeking=false;f.video.currentTime=804.704;f.listeners.get('seeked')({type:'seeked'});
  [...f.intervals.values()][0]();
  assert.equal(f.env.window.__rc19LatencyQA.read().done,false);
  const [dwellId,dwell]=[...f.timers].find(([,v])=>v.ms===300);f.timers.delete(dwellId);dwell.fn();
  assert.equal(f.env.window.__rc19LatencyQA.read().done,true);
  assert(f.env.window.__rc19LatencyQA.read().rows.some(x=>x.stage==='sampled-seek-settled'));
  const r=f.run('future-read-cleanup');assert.equal(r.done,true);assert.equal(r.rows.find(x=>x.stage==='target-frame').seeking,true);
  assert.equal(r.rows.find(x=>x.stage==='target-frame').intentToFrameMs,200);
  assert(r.rows.some(x=>x.stage==='seeked'));assert(!JSON.stringify(r).includes(secret));f.assertClean();checks++;
}
{
  const f=fixture();f.run('future-arm');f.env.state.authAccountKey='OTHER_PRIVATE';[...f.intervals.values()][0]();
  const r=f.run('future-read-cleanup');assert(r.rows.some(x=>x.stage==='owner-changed'));f.assertClean();checks++;
}
{
  const f=fixture();f.run('future-arm');const [id,timer]=[...f.timers].find(([,v])=>v.ms===40000);f.timers.delete(id);timer.fn();
  const r=f.run('future-read-cleanup');assert(r.rows.some(x=>x.stage==='timeout'));f.assertClean();checks++;
}
for(const field of ['accountId','driveSessionGeneration']){
  const f=fixture();f.run('future-arm');f.env.state[field]='OTHER_PRIVATE';[...f.intervals.values()][0]();
  const r=f.run('future-read-cleanup');assert(r.rows.some(x=>x.stage==='owner-changed'));f.assertClean();checks++;
}
for(const name of ['availability','retrospective-resources','future-arm','future-read-cleanup']){
  const s=read(name);new vm.Script(s);assert(!/\b(fetch|XMLHttpRequest|import|postMessage|clone)\s*\(/.test(s));
}
console.log(JSON.stringify({passed:true,checks,scope:'mock syntax, privacy filter, current generation/frame ordering and full callback cleanup; no actual/browser latency evidence'}));
