'use strict';
// Adapt maintained actual-app/SW/provider/lifetime code, serving an immutable
// exact Git snapshot. No product bytes or media pipeline are rewritten.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..'),basePath=path.join(root,'qa/rc15-lifecycle-qualification/qualify.cjs'),snapshot=path.join(__dirname,'public'),commit='e57d7b5b3154a2a838d01f631cf71fa063044280';
const hash=x=>crypto.createHash('sha256').update(x).digest('hex'),provenance=JSON.parse(fs.readFileSync(path.join(__dirname,'snapshot-provenance.json')));
assert.equal(provenance.sourceCommit,commit);for(const f of provenance.files){const data=fs.readFileSync(path.join(snapshot,f.path));assert.equal(hash(data),f.sha256);assert.equal(hash(execFileSync('git',['show',`${commit}:${f.path}`],{cwd:root,maxBuffer:80*1024*1024})),f.sha256);}
const fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'fixture-provenance.json'))),duration=+fixture.originalProbe.format.duration;assert.ok(duration>360);
let source=fs.readFileSync(basePath,'utf8');const replace=(before,after)=>{assert.ok(source.includes(before),`HARNESS_ANCHOR:${before.slice(0,50)}`);source=source.replace(before,after);};
replace("publicFiles=require('../../scripts/public-files.cjs')",`publicFiles=${JSON.stringify(provenance.files.map(f=>f.path))}`);
replace("fs.readFileSync(path.join(root,f))",`fs.readFileSync(path.join(${JSON.stringify(snapshot)},f))`);
replace("fs.readFileSync(path.join(root,name))",`fs.readFileSync(path.join(${JSON.stringify(snapshot)},name))`);
replace("const mode=process.argv[2]||'discriminator';", "const mode='long';");
replace("harness:Object.fromEntries(",`sourceCommit:'${commit}',immutableSnapshot:true,snapshotProvenanceSha256:'${hash(fs.readFileSync(path.join(__dirname,'snapshot-provenance.json')))}',fixtureProvenanceSha256:'${hash(fs.readFileSync(path.join(__dirname,'fixture-provenance.json')))}',adapterSha256:'${hash(fs.readFileSync(__filename))}',workerGateSha256:'${hash(fs.readFileSync(path.join(__dirname,'worker-gate.js')))}',audioObserverSha256:'${hash(fs.readFileSync(path.join(__dirname,'audio-observer.js')))}',audioWorkers:[],audioEvents:[],nativeObservations:[],harness:Object.fromEntries(`);
replace("['qualify.cjs','resource-snapshot.py','fixtures.py', '../q1-q2-app-integration/native-retirement-smoke.cjs','../q1-product-audit.cjs']", "['../rc15-lifecycle-qualification/qualify.cjs','../rc15-lifecycle-qualification/resource-snapshot.py','fixtures.py','../q1-q2-app-integration/native-retirement-smoke.cjs','../q1-product-audit.cjs']");
replace("path.join(__dirname,'resource-snapshot.py')", "path.join(root,'qa/rc15-lifecycle-qualification/resource-snapshot.py')");
replace("const fixturePaths={aac:'qa/faststart-h264-aac.mp4',ac3:'qa/q2-audio-compatibility/synthetic-avc-ac3.mp4',longaac:'qa/rc15-lifecycle-qualification/synthetic-72s-aac.mp4',longac3:'qa/rc15-lifecycle-qualification/synthetic-72s-ac3.mp4'};", "const fixturePaths={aac:'qa/faststart-h264-aac.mp4',ac3:'qa/q2-audio-compatibility/synthetic-avc-ac3.mp4',longac3:'qa/rc16-q2-longrun/synthetic-420s-ac3.mp4'};");
replace(" const page=await context.newPage(),errors=[]", " await context.addInitScript({path:path.join(__dirname,'worker-gate.js')});const page=await context.newPage(),errors=[]");
replace(" await page.goto(origin);",String.raw`
 const audioInstallations=[];
 page.on('worker',worker=>{if(!['/media/general-worker.mjs','/media/audio-general-worker.mjs'].includes(new URL(worker.url()).pathname))return;
  const task=(async()=>{
   await worker.evaluate(()=>true);
   const queued=await page.evaluate(()=>qaQueuedGeneralWorker());assert.ok(queued,'QUEUED_OWNED_GENERAL_WORKER');
   const impl=worker._connection.toImpl(worker),session=impl.existingExecutionContext.delegate._client;
   assert.ok(session?.send,'OWNED_WORKER_INSPECTOR_SESSION');
   session.on('Runtime.bindingCalled',event=>{if(event.name==='qaLongAudioBinding'){report.audioEvents.push(JSON.parse(event.payload));save();}});
   await session.send('Runtime.addBinding',{name:'qaLongAudioBinding'});
   const result=await worker.evaluate(({script,id})=>eval(script)({id}),{script:fs.readFileSync(path.join(__dirname,'audio-observer.js'),'utf8'),id:queued.id});
   report.audioWorkers.push({...queued,...result});save();await page.evaluate(id=>qaArmGeneralWorker(id),queued.id);
  })();audioInstallations.push(task);task.catch(e=>{report.audioObserverFailure={name:e.name};save();});
 });
 await page.goto(origin);`);
replace("const cdp=await context.newCDPSession(page);",String.raw`
const cdp=await context.newCDPSession(page);
 const managers=[page._connection.toImpl(page).delegate._networkManager,page._connection.toImpl(sw)._networkManager];assert.ok(managers.every(m=>m?._sessions instanceof Map),'EXACT_NETWORK_MANAGERS');
 report.networkCap={maxTotalBufferSize:0,maxResourceBufferSize:0,sessions:0};
 const cap=async session=>{await session.send('Network.enable',{maxTotalBufferSize:0,maxResourceBufferSize:0});report.networkCap.sessions++;};
 for(const manager of managers){const add=manager.addSession.bind(manager);manager.addSession=async(...args)=>{await add(...args);await cap(args[0]);};for(const info of manager._sessions.values())await cap(info.session);}
 const nativeObserve=async phase=>{const targets=(await browserCdp.send('Target.getTargets')).targetInfos,counts={};for(const t of targets)counts[t.type]=(counts[t.type]||0)+1;
  report.nativeObservations.push({phase,targetCounts:counts,liveWorkers:page.workers().length});save();await sample(phase);
 };`);
replace("  const value=await read();assert.notEqual", "  await page.waitForFunction(()=>state.mediaAttempt==='failed'||Number.isFinite(playerTimeline().duration)&&el.videoPlayer.videoWidth===320&&el.videoPlayer.getVideoPlaybackQuality().totalVideoFrames>0&&(!q1Playback||q1Playback.player.stats()?.mapping&&['ready','buffered-to-end'].includes(q1Playback.player.stats().phase)),null,{timeout:30000});await Promise.all(audioInstallations);const value=await read();assert.notEqual");
replace("buffered:Array.from({length:el.videoPlayer.buffered.length}", "nativeTime:el.videoPlayer.currentTime,nativeDuration:el.videoPlayer.duration,rate:el.videoPlayer.playbackRate,seeking:el.videoPlayer.seeking,selectedId:state.selected?.id,session:state.mediaSession,buffered:Array.from({length:el.videoPlayer.buffered.length}");
replace("return {context,page,read,open,seek,close,network,errors,engineErrors};", "return {context,page,read,open,seek,close,network,errors,engineErrors,nativeObserve};");
const longStart=source.indexOf(" if(mode==='long'){");const longEnd=source.indexOf(" report.producerEnd=hashes();",longStart);assert.ok(longStart>=0&&longEnd>longStart);
source=source.slice(0,longStart)+String.raw`
 if(mode==='long'){
  const t=await fresh();const r={route:'q2-auto-420s',passed:false,samples:[]};report.results.push(r);save();
  try{
   r.start=await t.open('q2',1,true);assert.equal(r.start.stats.status.level,'Q2');assert.equal(r.start.duration,420);assert.ok(r.start.time<1,'NORMAL_AUTOMATIC_INITIAL_POSITION');
   const generation=r.start.stats.generation,ownerSession=r.start.session;
   await t.page.evaluate(()=>{
    const v=el.videoPlayer;window.qaLongFrames={count:0,first:null,last:null,backwards:0,seconds:[],checkpoints:{},motion:[]};let previous=-1,second=-1;
    const callback=(_,m)=>{const item={mediaTime:m.mediaTime,sourceTime:m.mediaTime+(q1Playback?.player.stats()?.mapping?.commonShift||0),presentedFrames:m.presentedFrames,now:performance.now()};qaLongFrames.count++;qaLongFrames.first??=item;qaLongFrames.last=item;if(item.sourceTime<previous-.000001)qaLongFrames.backwards++;previous=item.sourceTime;
     const s=Math.floor(item.sourceTime);if(s!==second){second=s;qaLongFrames.seconds.push(item);}for(const target of [1,295,299,301,360,419])if(item.sourceTime>=target&&!qaLongFrames.checkpoints[target])qaLongFrames.checkpoints[target]=item;
     window.qaLongFrameId=v.requestVideoFrameCallback(callback);
    };window.qaLongFrameId=v.requestVideoFrameCallback(callback);
    for(const name of ['playing','pause','seeking','seeked','ratechange','ended'])v.addEventListener(name,()=>qaLongFrames.motion.push({type:name,time:v.currentTime,now:performance.now()}));
    v.playbackRate=1;window.qaLongStart=performance.now();return v.play();
   });const started=Date.now();await t.nativeObserve('long-started');
   for(let i=0;i<46;i++){
    await t.page.waitForTimeout(10000);const view=await t.read();r.samples.push({elapsedMs:Date.now()-started,...view});
    r.frames=await t.page.evaluate(()=>qaLongFrames);save();
    assert.notEqual(view.attempt,'failed','LONG_ROUTE_FAILED');assert.equal(view.stats.failure,null);assert.equal(view.stats.generation,generation,'UNINTERRUPTED_GENERAL_OWNER');assert.equal(view.session,ownerSession,'UNINTERRUPTED_APP_SESSION');assert.equal(view.selectedId,r.start.selectedId);assert.equal(view.rate,1);assert.equal(view.seeking,false);assert.equal(view.stats.status.level,'Q2');
    await t.nativeObserve('long-'+Math.round(view.time)+'s');console.log('progress',Math.round(view.time),'frames',view.frames);
    if(view.paused&&view.ended)break;assert.equal(view.paused,false,'UNINTERRUPTED_PLAYING');
   }
   r.end=await t.read();r.elapsedMs=Date.now()-started;r.frames=await t.page.evaluate(()=>{el.videoPlayer.cancelVideoFrameCallback(qaLongFrameId);return qaLongFrames;});
   assert.equal(r.end.ended,true,'NATIVE_END_REQUIRED');assert.equal(r.end.paused,true);assert.ok(Math.abs(r.end.time-420)<=1/48000,'ORIGINAL_SOURCE_END');assert.ok(r.elapsedMs>=410000&&r.elapsedMs<460000,'CONTIGUOUS_REALTIME_420S');
   assert.equal(r.frames.backwards,0);for(const mark of [295,299,301,360,419])assert.ok(r.frames.checkpoints[mark],'NATIVE_FRAME_THROUGH_'+mark);assert.ok(r.frames.count>=9500,'REAL_PRESENTED_FRAME_COVERAGE');assert.ok(r.frames.last.sourceTime>=419.9,'FINAL_ORIGINAL_VIDEO_CLOCK');
   assert.equal(r.frames.motion.filter(x=>x.type==='seeking'||x.type==='seeked').length,0,'NO_SEEK_DURING_CONTIGUOUS_PLAYBACK');
   const stats=r.end.stats;assert.ok(stats.removals>0);assert.ok(stats.waits>0);assert.ok(stats.peakAhead<=38);assert.ok(stats.peakRetainedAppendBytes<=24*1024*1024);assert.equal(stats.worker.terminated,true);assert.equal(stats.pipeline.audioCleanup.settled,true);assert.equal(stats.pipeline.audioMetrics.liveContexts,0);assert.equal(stats.pipeline.audioMetrics.failures,0);assert.equal(stats.pipeline.videoEncodersCreated,0);
   const finalAudio=report.audioEvents.filter(x=>x.closed).at(-1);assert.ok(finalAudio,'NATIVE_AUDIO_ENCODER_CLOSE_OBSERVED');assert.equal(finalAudio.configured.codec,'opus');assert.equal(finalAudio.configured.sampleRate,48000);assert.equal(finalAudio.configured.numberOfChannels,2);assert.equal(finalAudio.inputBackwards,0);assert.equal(finalAudio.outputBackwards,0);assert.equal(finalAudio.outputGaps,0);assert.ok(finalAudio.inputFrames>=419*48000);assert.ok(finalAudio.lastOutput.timestamp/1000000>=419.9,'NATIVE_AUDIO_OUTPUT_END_CLOCK');r.audioEnd=finalAudio;
   r.after=await t.close();await t.nativeObserve('long-native-ended-app-sw-closed');r.network=t.network;r.passed=true;save();console.log('420s automatic Q2 PASS',r.elapsedMs);
  }catch(e){report.failureObservation=await t.read();report.failureFrames=await t.page.evaluate(()=>window.qaLongFrames??null);report.failureNetwork=t.network;report.failureEngineErrors=t.engineErrors;await t.nativeObserve('failure-live');throw e;}finally{await t.context.close();await sample('long-context-closed');}
 }
`+source.slice(longEnd);
const compiled=new Module(__filename,module);compiled.filename=__filename;compiled.paths=module.paths;compiled._compile(source,__filename);
