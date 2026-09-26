'use strict';
// Serve a strict local-only public-fixture allowlist into an isolated Chrome.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {chromium}=require('playwright');
const root=__dirname,sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const workerTrial=process.argv.includes('--worker');
const fixture=fs.readFileSync(path.join(root,'synthetic-bframes-audiolead.ts'));
const prefixBytes=188*1100;
assert.equal(sha(fixture),'e05388c5f61b181710145a414443938e8065dd08e77e01c0aec0ffd0b73229e4');
const muxPath=require.resolve('mux.js/dist/mux-mp4.min.js');
assert.equal(sha(fs.readFileSync(muxPath)),'4d00d911c3186ca8921b8710de24cf4c4ea854e47c59d3c5164779ba83a2805f');
const html='<!doctype html><html lang="en"><meta charset="utf-8"><title>Local Q1 MSE trial</title><video muted playsinline controls width="360" height="640" aria-label="Public generated test video"></video><script src="/mux.js"></script><script type="module">import {startTrial} from "/mse-browser.mjs";window.startTrial=startTrial;</script></html>';
const allowed=new Map(['/mse-browser.mjs','/gop-stream.mjs','/elementary-stream.mjs','/psi-stream.mjs','/gop-boundaries.mjs','/init-sar.mjs',
  '/worker-client.mjs','/transmux-worker.mjs','/transmux-session.mjs','/buffer-window.mjs']
  .map(name=>[name,path.join(root,name.slice(1))]));
allowed.set('/v2-07a-container-probe/mpeg-ts-probe.mjs',path.join(root,'../v2-07a-container-probe/mpeg-ts-probe.mjs'));
allowed.set('/mux.js',muxPath);
allowed.set('/node_modules/mux.js/dist/mux-mp4.min.js',muxPath);
const runs=new Map();let browser;
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');const run=runs.get(url.searchParams.get('run'));
  if(url.pathname==='/'&&req.method==='GET'){res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'}).end(html);return;}
  if(url.pathname==='/source.ts'&&req.method==='GET'&&run&&!run.started){
    run.started=true;run.response=res;run.sent=prefixBytes;
    res.writeHead(200,{'Content-Type':'video/mp2t','Content-Length':fixture.length,'Cache-Control':'no-store'});
    res.write(fixture.subarray(0,prefixBytes));
    res.on('close',()=>{run.closed=true;run.response=null;});return;
  }
  if(url.pathname==='/release'&&req.method==='POST'&&run&&run.response&&!run.released){
    run.released=true;run.sent=fixture.length;run.response.end(fixture.subarray(prefixBytes));res.writeHead(204).end();return;
  }
  if(req.method==='GET'&&allowed.has(url.pathname)){res.writeHead(200,{'Content-Type':'text/javascript','Cache-Control':'no-store'}).end(fs.readFileSync(allowed.get(url.pathname)));return;}
  res.writeHead(404).end();
});

(async()=>{
  const directory=fs.mkdtempSync(path.join(root,workerTrial?'run-mse-worker-':'run-mse-'));
  const observations=[];
  try{
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const base=`http://127.0.0.1:${server.address().port}`;
    browser=await chromium.launch({channel:'chrome',headless:true});
    const modes=workerTrial?['incremental','abort-tail','invalid-init','play-rejected','ack-held','abort-ack']
      :['eof-only','incremental','abort-tail','invalid-init','play-rejected'];
    for(const mode of modes){
      const run={started:false,sent:0,released:false,closed:false,response:null};runs.set(mode,run);
      const context=await browser.newContext({serviceWorkers:'block',viewport:{width:800,height:800}});
      const page=await context.newPage();const errors=[];page.on('pageerror',()=>errors.push('PAGE_ERROR'));
      const snapshot=()=>page.evaluate(()=>structuredClone({...window.trial.state,worker:window.trial.workerStats()}));
      await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
      try{
        await page.goto(base);await page.waitForFunction(()=>typeof window.startTrial==='function');
        if(mode==='play-rejected')await page.evaluate(()=>{document.querySelector('video').play=()=>Promise.reject(new Error('injected'));});
        await page.evaluate(options=>{window.trial=window.startTrial(options);},
          {sourceUrl:`${base}/source.ts?run=${mode}`,sourceSize:fixture.length,engine:workerTrial?'worker':'main',
            holdFirstAck:['ack-held','abort-ack'].includes(mode),mode:['abort-tail','play-rejected','ack-held','abort-ack'].includes(mode)?'incremental':mode});
        await page.waitForFunction(()=>window.trial.state.received>0);
        if(mode==='eof-only'){
          await page.waitForTimeout(1500);
          const held=await snapshot();
          assert.equal(held.firstFrame,null);assert.equal(held.fragments,0);assert.equal(run.sent,prefixBytes);assert.equal(run.released,false);
          assert.equal((await fetch(`${base}/release?run=${mode}`,{method:'POST'})).status,204);
          await page.waitForFunction(()=>window.trial.state.firstFrame||window.trial.state.phase==='failed',null,{timeout:15000});
          const end=await snapshot();
          assert.equal(end.failure,null);assert.equal(end.firstFrame.sourceComplete,true);
          observations.push({mode,held,end});
        }else if(mode==='invalid-init'||mode==='play-rejected'){
          await page.waitForFunction(()=>window.trial.state.phase==='failed');
          await page.evaluate(()=>window.trial.dispose());
          const end=await snapshot();
          if(mode==='invalid-init'){
            assert.equal(end.firstFrame,null);assert.ok(end.appendErrors>0);assert.equal(end.appendCompletions,0);
          }else{assert.equal(end.failure,'QA_PLAY_REJECTED');assert.equal(end.appendCompletions,1);}
          assert.equal(end.disposed,true);assert.equal(end.urlRevoked,true);assert.equal(run.released,false);
          observations.push({mode,end});
        }else{
          await page.waitForFunction(()=>window.trial.state.firstFrame||window.trial.state.phase==='failed',null,{timeout:15000});
          const held=await snapshot();
          assert.equal(held.failure,null);assert.ok(held.firstFrame);assert.equal(held.firstFrame.sourceComplete,false);
          assert.ok(held.firstFrame.received<=prefixBytes&&held.firstFrame.consumed<fixture.length);
          assert.equal(held.firstFrame.width,360);assert.equal(held.firstFrame.height,640);
          assert.equal(run.released,false);assert.equal(run.sent,prefixBytes);
          let blocked=null;
          if(['ack-held','abort-ack'].includes(mode)){
            assert.equal(held.ackHeld,true);assert.equal(held.worker.acks,0);
            held.inspection=await page.evaluate(()=>window.trial.inspectWorker());
            assert.equal(held.inspection.awaitingFragment,1);assert.ok(held.inspection.retainedInputBytes>0);
            assert.equal((await fetch(`${base}/release?run=${mode}`,{method:'POST'})).status,204);
            await page.waitForTimeout(250);blocked=await snapshot();
            blocked.inspection=await page.evaluate(()=>window.trial.inspectWorker());
            assert.deepEqual(blocked.inspection,held.inspection,'actual worker owner cannot consume, enqueue or release credits while ACK held');
            assert.equal(blocked.worker.sourceBytesConsumed,held.worker.sourceBytesConsumed);
            assert.equal(blocked.worker.fragments,1);assert.equal(blocked.worker.acks,0);
            assert.equal(blocked.worker.inputs,held.worker.inputs);assert.equal(blocked.sourceComplete,false);
          }
          if(mode==='incremental'||mode==='ack-held'){
            if(mode==='ack-held')await page.evaluate(()=>window.trial.releaseAck());
            else
            assert.equal((await fetch(`${base}/release?run=${mode}`,{method:'POST'})).status,204);
            await page.waitForFunction(()=>window.trial.state.phase==='complete'||window.trial.state.phase==='failed');
            await page.waitForFunction(()=>window.trial.state.frames>=3||window.trial.state.failure);
            const end=await snapshot();
            assert.equal(end.failure,null);assert.equal(end.sourceComplete,true);assert.equal(end.fragments,6);
            assert.equal(end.appends,end.appendCompletions);assert.equal(end.peakPendingReads,1);
            assert.ok(end.peakQueuedBytes<=2*1024*1024);
            if(workerTrial){assert.equal(end.worker.status,'finished');assert.equal(end.worker.inputs,end.worker.detachedInputs);
              assert.equal(end.worker.fragments,6);assert.equal(end.worker.acks,6);assert.equal(end.worker.peakPendingInputs,1);}
            else assert.equal(end.owner.retainedBytes,0);
            assert.ok(end.lastMediaTime>held.firstFrame.mediaTime);observations.push({mode,held,blocked,end});
          }else{
            await page.evaluate(()=>window.trial.dispose());await page.waitForFunction(()=>window.trial.state.phase==='failed');
            const end=await snapshot();
            assert.equal(end.failure,'QA_CANCELLED');assert.equal(end.sourceComplete,false);
            if(workerTrial)assert.equal(end.worker.status,'aborted');else assert.equal(end.owner.retainedBytes,0);
            assert.equal(end.disposed,true);assert.equal(end.urlRevoked,true);assert.equal(end.pendingReads,0);
            observations.push({mode,held,blocked,end});
          }
        }
        assert.deepEqual(errors,[]);
        await page.evaluate(()=>window.trial.dispose());
        assert.equal(await page.evaluate(()=>document.querySelector('video').getAttribute('src')),null);
        const cleanup=await page.evaluate(()=>structuredClone(window.trial.state.cleanup));
        if(!workerTrial){assert.ok(cleanup.muxCachedGopsBefore>0,'each trial populated the real mux GOP cache');
          assert.equal(cleanup.muxCachedGopsAfter,0);}
        else{
          assert.equal(cleanup.worker.terminated,true);
          const session=cleanup.worker.worker;assert.ok(session);
          for(const key of ['retainedInputBytes','retainedOutputBytes','outstandingOutputBytes','configBytes','initBytes',
            'muxCachedGops','muxCachedNalBytes','muxCachedBufferBytes'])assert.equal(session[key],0,key);
          assert.equal(session.muxReleased,true);assert.equal(session.owner.retainedBytes,0);
          assert.ok(session.cleanup.beforeGops>0,'worker populated real mux GOP cache');
          assert.ok(session.cleanup.beforeBufferBytes>0);assert.equal(session.cleanup.afterBufferBytes,0);
          assert.ok(session.peakInputBytes<=65536);assert.ok(session.peakOutputBytes<=2*1024*1024);
          assert.ok(session.peakMuxCachedBufferBytes<=8*1024*1024);
        }
        assert.equal(cleanup.muxReleased,true);
        assert.equal(cleanup.readerReleased,true);assert.equal(cleanup.sourceBuffers,0);
        observations[observations.length-1].cleanup=cleanup;
      }finally{await context.close();run.response?.destroy();}
      assert.equal(run.closed,true);
    }
    const sources={};for(const file of [__filename,...allowed.values()])sources[path.relative(root,file).replaceAll('\\','/')]=sha(fs.readFileSync(file));
    const report={schema:workerTrial?'drive-original.q1-mse-worker/1':'drive-original.q1-mse-browser/1',recordedAt:new Date().toISOString(),browser:browser.version(),
      fixture:{bytes:fixture.length,sha256:sha(fixture),heldPrefixBytes:prefixBytes},producer:{sources,node:process.version},observations,
      limitations:['isolated desktop Chrome with public synthetic bytes, not Drive/SW/product/iPhone/PWA',
        'single small CFR H264/AAC clip, no full-format/priority/color/HDR/rotation/track-selection acceptance',
        workerTrial?'dedicated-worker proof harness, not product/authenticated-source/long-run total memory or sustained buffer eviction implementation'
          :'main-thread proof harness, not worker or long-run total memory/backpressure/seek implementation',
        'first-frame and frame progress only; no decoded pixel/audio comparison in Chrome, no indexed seek or duration discovery']};
    fs.writeFileSync(path.join(directory,'results.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
    console.log(JSON.stringify({report:path.relative(root,path.join(directory,'results.json')),passed:observations.length}));
  }finally{await browser?.close();for(const run of runs.values())run.response?.destroy();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error('Local MSE probe failed:',error.message);process.exitCode=1;});
