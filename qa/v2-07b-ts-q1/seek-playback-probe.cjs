'use strict';
// Public fixture only. Whole-source native buffers belong to the independent QA
// oracle, never to the bounded browser pipeline or its memory accounting.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const assert=require('node:assert/strict'),{spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const {chromium}=require('playwright'),{extract,decode}=require('./incremental-probe.cjs'),{compare}=require('./preservation-probe.cjs');
const root=__dirname,sha=bytes=>createHash('sha256').update(bytes).digest('hex'),muxPath=require.resolve('mux.js/dist/mux-mp4.min.js');
assert.equal(sha(fs.readFileSync(muxPath)),'4d00d911c3186ca8921b8710de24cf4c4ea854e47c59d3c5164779ba83a2805f');
function command(executable,args){const result=spawnSync(executable,args,{windowsHide:true,timeout:60000,maxBuffer:64*1024*1024});
  assert.ok(!result.error&&result.status===0&&!result.stderr.length,'PUBLIC_NATIVE_TOOL_FAILED');return result.stdout;}
const generator=['-v','error','-hide_banner','-nostdin','-n',
  '-f','lavfi','-i','testsrc2=size=360x640:rate=30:duration=180',
  '-f','lavfi','-i','sine=frequency=880:sample_rate=48000:duration=180',
  '-map','0:v:0','-map','1:a:0','-vf','setpts=PTS+0.25/TB',
  '-c:v','libx264','-threads:v','1','-preset','veryfast','-profile:v','high','-level:v','3.0',
  '-pix_fmt','yuv420p','-g','60','-keyint_min','60','-sc_threshold','0','-bf','2',
  '-x264-params','aud=1:repeat-headers=1','-c:a','aac','-b:a','96k','-ar','48000','-ac','2','-f','mpegts'];
(async()=>{
  const directory=fs.mkdtempSync(path.join(root,'run-seek-playback-')),sourceFile=path.join(directory,'continuous.ts'),generated=[sourceFile];
  let browser,server;const native=[],observations=[],runs=new Map();
  try{
    const {probeTsSeek}=await import('./ts-seek.mjs'),{prepareTsSeekInput}=await import('./seek-input.mjs');
    const {createTransmuxSession}=await import('./transmux-session.mjs');
    command('ffmpeg',[...generator,sourceFile]);const fixture=fs.readFileSync(sourceFile),fixtureHash=sha(fixture);
    assert.ok(fixture.length>16*1024*1024&&fixture.length<32*1024*1024);
    const oracle=JSON.parse(command('ffprobe',['-v','error','-show_packets','-show_streams','-show_entries',
      'packet=stream_index,pts,dts,pos,flags,duration:stream=index,codec_type,sample_rate,channels','-of','json',sourceFile]));
    const vt=oracle.streams.find(row=>row.codec_type==='video'),at=oracle.streams.find(row=>row.codec_type==='audio');
    assert.equal(Number(at.sample_rate),48000);assert.equal(at.channels,2);
    const videoPackets=oracle.packets.filter(row=>row.stream_index===vt.index).sort((a,b)=>a.pts-b.pts);
    const audioPackets=oracle.packets.filter(row=>row.stream_index===at.index);
    const fullVideo=command('ffmpeg',['-v','error','-nostdin','-threads','1','-i',sourceFile,'-map','0:v:0','-an',
      '-vf','format=yuv420p','-fps_mode','passthrough','-f','framemd5','pipe:1']).toString('utf8')
      .split(/\r?\n/).filter(line=>line&&!line.startsWith('#')).map(line=>line.split(',').slice(-2).map(value=>value.trim()));
    const fullPcm=command('ffmpeg',['-v','error','-nostdin','-threads','1','-i',sourceFile,'-map','0:a:0','-vn','-c:a','pcm_s16le','-f','s16le','pipe:1']);
    assert.equal(fullVideo.length,videoPackets.length);assert.equal(fullVideo.length,5400);
    const firstAudioPts=audioPackets[0].pts;
    for(const fraction of [.1,.5,.9]){
      const read=async({start,end})=>Uint8Array.from(fixture.subarray(start,end+1));
      const plan=await probeTsSeek({read,sourceSize:fixture.length,fraction});
      const prepared=prepareTsSeekInput({headBytes:fixture.subarray(0,Math.floor(65536/188)*188),
        bytes:fixture.subarray(plan.local.windowStart,plan.local.windowEndExclusive),offset:plan.local.windowStart,plan});
      const clip=path.join(directory,`clip-${fraction}.ts`),output=path.join(directory,`clip-${fraction}.mp4`);generated.push(clip,output);
      fs.writeFileSync(clip,prepared.bytes,{flag:'wx'});let session;const fragments=[];
      session=createTransmuxSession({generation:1,sourceSize:prepared.bytes.length,Transmuxer:require(muxPath).Transmuxer,send(message){
        if(message.type==='fragment'){fragments.push(Buffer.from(message.bytes));session.receive({type:'ack',generation:1,fragmentSequence:message.fragmentSequence});}
      }});
      for(let offset=0,sequence=1;offset<prepared.bytes.length;offset+=65536,sequence++)
        session.receive({type:'input',generation:1,sequence,offset,bytes:Uint8Array.from(prepared.bytes.subarray(offset,offset+65536)).buffer});
      session.receive({type:'eof',generation:1});assert.equal(session.stats().state,'finished',JSON.stringify(session.stats()));assert.equal(fragments.length,1);
      fs.writeFileSync(output,Buffer.concat(fragments),{flag:'wx'});
      const quality=compare(extract(clip),extract(output));assert.equal(quality.preserved,true,JSON.stringify(quality));
      const decoded=decode(output),decodedClip=decode(clip);assert.deepEqual(decoded.frames,decodedClip.frames);assert.ok(decoded.pcm.equals(decodedClip.pcm));
      const first=videoPackets.findIndex(row=>row.pts===prepared.video.startPts);assert.ok(first>=0);
      assert.equal(decoded.frames.length,prepared.video.frames);assert.deepEqual(decoded.frames,fullVideo.slice(first,first+prepared.video.frames));
      const pcmSample=(prepared.audio.startPts-firstAudioPts)*48000/90000;assert.ok(Number.isInteger(pcmSample));
      const warmup=1024,bytesPerSample=4;
      assert.ok(prepared.audio.prerollFrames>=2);
      assert.equal(decoded.pcm.length,prepared.audio.frames*1024*bytesPerSample,'ALL_SELECTED_AAC_FRAMES_MUST_DECODE');
      assert.ok(decoded.pcm.length>warmup*bytesPerSample);
      assert.ok(pcmSample>=0&&pcmSample*bytesPerSample+decoded.pcm.length<=fullPcm.length,'SOURCE_PCM_MUST_COVER_SELECTED_INTERVAL');
      assert.ok(decoded.pcm.subarray(warmup*bytesPerSample).equals(fullPcm.subarray((pcmSample+warmup)*bytesPerSample,pcmSample*bytesPerSample+decoded.pcm.length)),
        'AAC_AFTER_PREROLL_MUST_MATCH_SOURCE');
      native.push({fraction,sourceWindow:{start:plan.local.windowStart,endExclusive:plan.local.windowEndExclusive},
        packagedBytes:prepared.bytes.length,packagedSha256:sha(prepared.bytes),video:prepared.video,audio:prepared.audio,
        quality,sourceVideoFramesEqual:true,sourcePcmAfterOneFramePrerollEqual:true,decodedPcmBytes:decoded.pcm.length,
        comparedPcmBytes:decoded.pcm.length-warmup*bytesPerSample,decoderWarmupSamples:1024,decoderDiagnostics:0});
    }
    const identity={accountKey:'public-qa-account',fileId:'generated-local-seek-control',version:'1',size:String(fixture.length),
      modifiedTime:'2026-09-26T00:00:00.000Z',mimeType:'video/mp2t',canDownload:true};
    const files=['seek-browser.mjs','seek-input.mjs','ts-seek.mjs','ts-window.mjs','gop-boundaries.mjs','psi-stream.mjs',
      'worker-client.mjs','transmux-worker.mjs','transmux-session.mjs','gop-stream.mjs','elementary-stream.mjs','init-sar.mjs'];
    const allowed=new Map(files.map(file=>['/'+file,path.join(root,file)]));
    for(const file of ['v2-07a-container-probe/mpeg-ts-probe.mjs','v2-07a-bounded-probe/bounded-probe.mjs'])allowed.set('/'+file,path.join(root,'../'+file));
    allowed.set('/node_modules/mux.js/dist/mux-mp4.min.js',muxPath);
    const html='<!doctype html><html lang="en"><meta charset="utf-8"><title>Local source-clock seek QA</title><video muted playsinline width="360" height="640" aria-label="Generated public video"></video><script type="module">import {startSeek} from "/seek-browser.mjs";window.startSeek=startSeek;</script></html>';
    server=http.createServer((req,res)=>{
      const url=new URL(req.url,'http://localhost'),run=runs.get(url.searchParams.get('run'));
      if(req.method==='GET'&&url.pathname==='/'){res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'}).end(html);return;}
      if(req.method==='GET'&&allowed.has(url.pathname)){res.writeHead(200,{'Content-Type':'text/javascript','Cache-Control':'no-store'}).end(fs.readFileSync(allowed.get(url.pathname)));return;}
      if(!run||req.method!=='GET'){res.writeHead(404).end();return;}
      if(url.pathname==='/identity'){
        run.identityReads++;res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'})
          .end(JSON.stringify({...identity,version:run.drift&&run.identityReads>1?'2':'1'}));return;
      }
      if(url.pathname!=='/source.ts'){res.writeHead(404).end();return;}
      const match=/^bytes=(\d+)-(\d+)$/.exec(req.headers.range||'');
      if(!match){res.writeHead(416).end();return;}const start=Number(match[1]),end=Number(match[2]),length=end-start+1;
      if(!Number.isSafeInteger(end)||start<0||length<1||length>1024*1024||end>=fixture.length){res.writeHead(416).end();return;}
      run.ranges.push({start,end});
      const deliver=()=>{run.sent+=length;res.writeHead(206,{'Content-Type':'video/mp2t','Content-Length':length,
        'Content-Range':`bytes ${start}-${end}/${fixture.length}`,'Accept-Ranges':'bytes','Cache-Control':'no-store'})
        .end(fixture.subarray(start,end+1));};
      if(run.hold&&run.ranges.length===3){run.held=true;res.on('close',()=>{run.closed=true;});run.release=deliver;return;}deliver();
    });
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
    browser=await chromium.launch({channel:'chrome',headless:true});
    for(const mode of ['seek-10','seek-50','seek-90','replace-held-seek','postflight-drift']){
      const run={identityReads:0,ranges:[],sent:0,hold:mode==='replace-held-seek',drift:mode==='postflight-drift'};runs.set(mode,run);
      const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage(),errors=[];
      page.on('pageerror',()=>errors.push('PAGE_ERROR'));await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
      const options=(name,fraction)=>({sourceUrl:`${base}/source.ts?run=${name}`,metadataUrl:`${base}/identity?run=${name}`,identity,fraction});
      try{
        await page.goto(base);await page.waitForFunction(()=>window.startSeek);
        const fraction=mode.startsWith('seek-')?Number(mode.slice(5))/100:.5;
        await page.evaluate(options=>{window.first=window.startSeek(options);},options(mode,fraction));
        let active='first',old=null;
        if(run.hold){
          const deadline=Date.now()+10000;while(!run.held&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,20));assert.equal(run.held,true);
          const second={identityReads:0,ranges:[],sent:0};runs.set('replacement',second);
          await page.evaluate(options=>{window.second=window.startSeek(options);},options('replacement',.9));active='second';
          old=await page.evaluate(()=>window.first.promise);assert.equal(old.phase,'cancelled');assert.equal(old.presented,null);
          assert.equal(old.disposed,true);assert.equal(old.appends,0);assert.equal(run.ranges.length,3);
        }
        const final=await page.evaluate(key=>window[key].promise,active);
        if(run.drift){assert.equal(final.phase,'failed');assert.equal(final.failure,'POSTFLIGHT_DRIFT');assert.equal(final.appends,0);assert.equal(final.presented,null);}
        else{
          assert.equal(final.phase,'presented',JSON.stringify(final));assert.equal(final.presented.width,360);assert.equal(final.presented.height,640);
          assert.ok(Math.abs(final.presented.mediaTime-final.target.seconds)<=final.target.tolerance);
          const sourceTicks=Math.round(final.presented.mediaTime*90000+final.target.originTicks);
          assert.ok(videoPackets.some(packet=>Math.abs(packet.pts-sourceTicks)<=1),'PRESENTED_CLOCK_MUST_MATCH_SOURCE_FRAME');
          assert.equal(final.appends,1);assert.equal(final.appendUpdates,1);assert.equal(final.appendErrors,0);
          assert.equal(final.worker.status,'finished');assert.equal(final.worker.worker.owner.retainedBytes,0);
          assert.ok(final.probe.metrics.receivedBytes<fixture.length*.35);
        }
        await page.evaluate(key=>window[key].dispose(),active);const cleanup=await page.evaluate(key=>window[key].state,active);
        assert.equal(cleanup.disposed,true);assert.equal(cleanup.retainedInputBytes,0);
        if(!run.drift){assert.equal(cleanup.urlRevoked,true);assert.equal(cleanup.bufferRemoved,true);assert.equal(cleanup.cleanupFailure,undefined);assert.equal(cleanup.worker.terminated,true);
          assert.equal(cleanup.worker.worker.muxCachedBufferBytes,0);assert.equal(cleanup.worker.worker.retainedInputBytes,0);}
        assert.deepEqual(errors,[]);observations.push({mode,final,cleanup,old,server:{ranges:run.ranges,sent:run.sent,held:Boolean(run.held),closed:Boolean(run.closed)}});
      }finally{await context.close();}
    }
    const sources={};for(const file of ['seek-playback-probe.cjs','incremental-probe.cjs','preservation-probe.cjs',...files,'../v2-07a-container-probe/mpeg-ts-probe.mjs',
      '../v2-07a-bounded-probe/bounded-probe.mjs'])sources[file]=sha(fs.readFileSync(path.join(root,file)));
    const report={schema:'drive-original.q1-ts-seek-playback/1',recordedAt:new Date().toISOString(),
      producer:{sources,node:process.version,chrome:browser.version(),muxSha256:sha(fs.readFileSync(muxPath)),
        ffmpeg:command('ffmpeg',['-version']).toString('utf8').split(/\r?\n/)[0]},
      fixture:{durationSeconds:180,bytes:fixture.length,sha256:fixtureHash,generator},native,observations,
      limitations:['generated local desktop Chrome only; no actual Drive/priority/iPhone or shipped product claim',
        'one bounded GOP per seek; continuous post-seek playback, global source clock/duration and other formats remain unverified',
        'native source-PCM equality excludes one AAC decoder warmup frame; copied compressed frames are preserved; browser is muted, audibility/color rendering not verified',
        'native whole-source oracle is outside bounded browser memory; no total heap/decoder/GPU accounting']};
    fs.writeFileSync(path.join(directory,'results.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
    console.log(JSON.stringify({report:path.relative(root,path.join(directory,'results.json')),native:native.length,browser:observations.length}));
  }catch(error){
    fs.writeFileSync(path.join(directory,'failure.json'),JSON.stringify({code:error.code||'QA_FAILURE',message:error.message},null,2)+'\n',{flag:'wx'});throw error;
  }finally{
    if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));
    for(const file of generated)try{fs.unlinkSync(file);}catch(error){if(error.code!=='ENOENT')throw error;}
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
