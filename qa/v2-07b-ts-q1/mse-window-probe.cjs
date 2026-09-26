'use strict';
// Public continuous-media QA only. Node fixtures/oracles deliberately retain
// comparison buffers; those are outside the observed browser media pipeline.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const {createHash}=require('node:crypto'),{chromium}=require('playwright');
const {extract,decode}=require('./incremental-probe.cjs'),{compare}=require('./preservation-probe.cjs');
const root=__dirname,sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const muxPath=require.resolve('mux.js/dist/mux-mp4.min.js');
assert.equal(sha(fs.readFileSync(muxPath)),'4d00d911c3186ca8921b8710de24cf4c4ea854e47c59d3c5164779ba83a2805f');
const generator=['-v','error','-hide_banner','-nostdin','-n',
  '-f','lavfi','-i','testsrc2=size=360x640:rate=30:duration=72',
  '-f','lavfi','-i','sine=frequency=880:sample_rate=48000:duration=72',
  '-map','0:v:0','-map','1:a:0','-vf','setpts=PTS+0.25/TB',
  '-c:v','libx264','-threads:v','1','-preset','veryfast','-profile:v','high','-level:v','3.0',
  '-pix_fmt','yuv420p','-g','60','-keyint_min','60','-sc_threshold','0','-bf','2',
  '-x264-params','aud=1:repeat-headers=1','-c:a','aac','-b:a','96k','-ar','48000','-ac','2','-f','mpegts'];
function command(executable,args){const r=spawnSync(executable,args,{windowsHide:true,timeout:60000,maxBuffer:1024*1024});
  assert.ok(!r.error&&r.status===0&&!r.stderr.length,'PUBLIC_FIXTURE_TOOL_FAILED');return r.stdout.toString('utf8');}

(async()=>{
  const directory=fs.mkdtempSync(path.join(root,'run-mse-window-'));
  const sourceFile=path.join(directory,'continuous.ts'),outputFile=path.join(directory,'continuous.mp4');
  const generated=[sourceFile,outputFile];let browser,server;const observations=[],requests=new Map();
  try{
    command('ffmpeg',[...generator,sourceFile]);const fixture=fs.readFileSync(sourceFile);
    assert.ok(fixture.length<16*1024*1024);const fixtureHash=sha(fixture),etag=`"${fixtureHash}"`;
    const pauseOnly=process.argv.includes('--pause-only');let preservation=null;
    if(!pauseOnly){
      const {createTransmuxSession}=await import('./transmux-session.mjs');
      let session;const fragments=[];
      session=createTransmuxSession({generation:1,sourceSize:fixture.length,Transmuxer:require(muxPath).Transmuxer,
        send(message){
          if(message.type==='error')throw new Error('PUBLIC_SESSION_FAILED');
          if(message.type==='fragment'){fragments.push(Buffer.from(message.bytes));
            session.receive({type:'ack',generation:1,fragmentSequence:message.fragmentSequence});}
        }});
      for(let offset=0,sequence=1;offset<fixture.length;offset+=65536,sequence++)
        session.receive({type:'input',generation:1,sequence,offset,bytes:Uint8Array.from(fixture.subarray(offset,offset+65536)).buffer});
      session.receive({type:'eof',generation:1});assert.equal(session.stats().state,'finished');assert.equal(fragments.length,36);
      const output=Buffer.concat(fragments);fs.writeFileSync(outputFile,output,{flag:'wx'});
      const quality=compare(extract(sourceFile),extract(outputFile));const original=decode(sourceFile),derived=decode(outputFile);
      assert.equal(quality.preserved,true);assert.deepEqual(derived.frames,original.frames);assert.ok(derived.pcm.equals(original.pcm));
      preservation={quality,decodedFrames:derived.frames.length,decodedVideoEqual:true,decodedPcmEqual:true,
        decoderDiagnostics:0,outputSha256:sha(output),fragments:36,session:session.stats()};
    }
    const files=['mse-browser.mjs','buffer-window.mjs','worker-client.mjs','transmux-worker.mjs','transmux-session.mjs',
      'gop-stream.mjs','gop-boundaries.mjs','elementary-stream.mjs','psi-stream.mjs','init-sar.mjs'];
    const allowed=new Map(files.map(file=>['/'+file,path.join(root,file)]));
    allowed.set('/v2-07a-container-probe/mpeg-ts-probe.mjs',path.join(root,'../v2-07a-container-probe/mpeg-ts-probe.mjs'));
    allowed.set('/node_modules/mux.js/dist/mux-mp4.min.js',muxPath);
    const html='<!doctype html><html lang="en"><meta charset="utf-8"><title>Local buffer-window QA</title><video muted playsinline width="360" height="640" aria-label="Generated public video"></video><script type="module">import {startTrial} from "/mse-browser.mjs";window.startTrial=startTrial;</script></html>';
    server=http.createServer((req,res)=>{
      const url=new URL(req.url,'http://localhost'),run=requests.get(url.searchParams.get('run'));
      if(req.method==='GET'&&url.pathname==='/'){res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'}).end(html);return;}
      if(req.method==='GET'&&url.pathname==='/source.ts'&&run){
        const range=/^bytes=(\d+)-(\d+)$/.exec(req.headers.range||'');
        if(!range||req.headers['if-match']!==etag){res.writeHead(412).end();return;}
        const start=Number(range[1]),end=Number(range[2]),length=end-start+1;
        if(start!==run.sent||length<1||length>65536||end>=fixture.length){res.writeHead(416).end();return;}
        run.requests++;run.sent+=length;run.maxBytes=Math.max(run.maxBytes,length);
        const tag=run.drift&&run.requests===5?'"'+'0'.repeat(64)+'"':etag;
        res.writeHead(206,{'Content-Type':'video/mp2t','Content-Length':length,'Content-Range':`bytes ${start}-${end}/${fixture.length}`,
          ETag:tag,'Cache-Control':'no-store'}).end(fixture.subarray(start,end+1));return;
      }
      if(req.method==='GET'&&allowed.has(url.pathname)){res.writeHead(200,{'Content-Type':'text/javascript','Cache-Control':'no-store'}).end(fs.readFileSync(allowed.get(url.pathname)));return;}
      res.writeHead(404).end();
    });
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
    browser=await chromium.launch({channel:'chrome',headless:true});
    const modes=pauseOnly?['paused-complete']:['unbounded-control','paused-complete','abort-window','remove-rejected','identity-drift','media-error-paused'];
    for(const mode of modes){
      const run={requests:0,sent:0,maxBytes:0,drift:mode==='identity-drift'};requests.set(mode,run);
      const context=await browser.newContext({serviceWorkers:'block'});const page=await context.newPage(),errors=[];
      page.on('pageerror',()=>errors.push('PAGE_ERROR'));
      await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
      const snapshot=()=>page.evaluate(()=>structuredClone({...window.trial.state,worker:window.trial.workerStats(),
        currentTime:document.querySelector('video').currentTime,playbackRate:document.querySelector('video').playbackRate,
        ended:document.querySelector('video').ended}));
      try{
        await page.goto(base);await page.waitForFunction(()=>window.startTrial);
        await page.evaluate(()=>{const video=document.querySelector('video');video.defaultPlaybackRate=4;video.playbackRate=4;});
        if(mode==='remove-rejected')await page.evaluate(()=>{SourceBuffer.prototype.remove=()=>{throw new DOMException('injected','InvalidStateError');};});
        await page.evaluate(options=>{window.trial=window.startTrial(options);},
          {sourceUrl:`${base}/source.ts?run=${mode}`,sourceSize:fixture.length,sourceEtag:etag,engine:'worker',inputMode:'ranges',
            windowed:mode!=='unbounded-control',pauseAtWindow:['paused-complete','abort-window','media-error-paused'].includes(mode)});
        let held=null,still=null;
        if(['paused-complete','abort-window','media-error-paused'].includes(mode)){
          await page.waitForFunction(()=>window.trial.state.window.waiting||window.trial.state.failure);
          held=await snapshot();assert.equal(held.failure,null);assert.ok(held.window.waiting);
          held.inspection=await page.evaluate(()=>window.trial.inspectWorker());held.server={...run};
          assert.equal(held.rangeRequestPending,false);assert.ok(run.sent<fixture.length/4);
          const pauseMs=mode==='paused-complete'?16100:300;
          await page.waitForTimeout(pauseMs);still=await snapshot();still.pausedMs=pauseMs;still.server={...run};
          assert.equal(still.failure,null,`pause must not fail: ${still.failure}`);
          still.inspection=await page.evaluate(()=>window.trial.inspectWorker());
          assert.deepEqual(still.inspection,held.inspection);assert.deepEqual(still.server,held.server);
          assert.equal(still.worker.inputs,held.worker.inputs);assert.equal(still.appendCompletions,held.appendCompletions);
          if(mode==='abort-window'){
            await page.evaluate(()=>window.trial.dispose());await page.waitForFunction(()=>window.trial.state.phase==='failed');
          }else if(mode==='media-error-paused'){
            await page.evaluate(()=>document.querySelector('video').dispatchEvent(new Event('error')));
          }else await page.evaluate(()=>document.querySelector('video').play());
        }
        await page.waitForFunction(()=>['complete','failed'].includes(window.trial.state.phase),null,{timeout:60000});
        if(['unbounded-control','paused-complete'].includes(mode)){
          await page.waitForFunction(()=>window.trial.state.firstFrame||window.trial.state.failure);
          if(mode==='paused-complete')await page.waitForFunction(()=>document.querySelector('video').ended||window.trial.state.failure,null,{timeout:15000});
        }
        const end=await snapshot();
        assert.equal(end.playbackRate,4);
        if(mode==='unbounded-control'){
          assert.equal(end.failure,null);assert.equal(end.fragments,36);assert.ok(end.window.peakSpan>70);
          assert.equal(end.window.removals,0);assert.equal(run.sent,fixture.length);
        }else if(mode==='paused-complete'){
          assert.equal(end.failure,null);assert.equal(end.fragments,36);assert.equal(end.worker.acks,36);
          assert.ok(end.window.removals>10);assert.ok(end.window.waits>10);assert.ok(end.window.peakAhead<8.1);
          assert.ok(end.window.peakSpan<16);assert.ok(end.lastMediaTime>71);assert.equal(end.ended,true);
          assert.equal(end.rangeBytes,fixture.length);assert.equal(run.sent,fixture.length);
        }else if(mode==='abort-window'){
          assert.equal(end.failure,'QA_CANCELLED');assert.equal(end.worker.status,'aborted');assert.equal(end.sourceComplete,false);
        }else if(mode==='remove-rejected'){
          assert.equal(end.failure,'QA_MEDIA_ACTION_ERROR');assert.equal(end.disposed,true);assert.equal(end.sourceComplete,false);
        }else if(mode==='identity-drift'){
          assert.equal(end.failure,'QA_RANGE_RESPONSE');assert.equal(end.sourceComplete,false);assert.equal(run.requests,5);
        }else{
          assert.equal(end.failure,'QA_MEDIA_ELEMENT_ERROR');assert.equal(end.sourceComplete,false);assert.equal(end.disposed,true);
        }
        assert.equal(run.maxBytes,65536);assert.ok(end.peakInputChunkBytes<=65536);assert.ok(end.peakPendingReads<=1);
        await page.evaluate(()=>window.trial.dispose());const cleanup=await snapshot();
        assert.equal(cleanup.cleanup.sourceBuffers,0);assert.equal(cleanup.cleanup.readerReleased,true);
        assert.equal(cleanup.worker.terminated,true);assert.equal(cleanup.worker.worker.muxCachedBufferBytes,0);
        assert.equal(cleanup.worker.worker.retainedInputBytes,0);assert.equal(cleanup.window.waiting,false);
        assert.equal(cleanup.pendingReads,0);assert.equal(cleanup.rangeRequestPending,false);assert.equal(cleanup.urlRevoked,true);
        assert.deepEqual(errors,[]);
        observations.push({mode,held,still,end,cleanup:cleanup.cleanup,server:{...run}});
      }catch(error){
        const state=await snapshot().catch(()=>null);
        fs.writeFileSync(path.join(directory,'failure.json'),JSON.stringify({mode,state,server:{...run}},null,2)+'\n',{flag:'wx'});
        throw error;
      }finally{await context.close();}
    }
    const sources={};for(const file of [__filename,...allowed.values(),path.join(root,'incremental-probe.cjs'),path.join(root,'preservation-probe.cjs')])
      sources[path.relative(root,file).replaceAll('\\','/')]=sha(fs.readFileSync(file));
    const report={schema:'drive-original.q1-mse-window/1',recordedAt:new Date().toISOString(),browser:browser.version(),
      fixture:{bytes:fixture.length,sha256:fixtureHash,generatorArgs:generator},
      producer:{sources,node:process.version,ffmpeg:command('ffmpeg',['-version']).split(/\r?\n/)[0],
        ffprobe:command('ffprobe',['-version']).split(/\r?\n/)[0]},preservation,observations,
      limitations:['local generated 72-second CFR H264/AAC media, not sustained actual Drive/device acceptance',
        '4x desktop playback and a 16.1-second pause, not real-time long-run battery/heat or iPhone/PWA',
        'exposed SourceBuffer timeline and encoded owner counts, not total browser/decoder/GPU heap',
        'sequential exact bounded ranges; no indexed seek/duration discovery or arbitrary GOP/format support',
        'native full decoded comparison is independent QA, not Chrome pixel/audio equivalence']};
    fs.writeFileSync(path.join(directory,'results.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
    console.log(JSON.stringify({report:path.relative(root,path.join(directory,'results.json')),passed:observations.length}));
  }finally{
    await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));
    for(const target of generated){assert.equal(path.dirname(target),directory);assert.equal(path.dirname(directory),path.resolve(root));
      if(fs.existsSync(target))fs.unlinkSync(target);}
  }
})().catch(error=>{console.error('Local window probe failed:',error.message);process.exitCode=1;});
