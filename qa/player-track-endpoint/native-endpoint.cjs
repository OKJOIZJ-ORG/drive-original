'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {chromium}=require('../node_modules/playwright');
const root=path.resolve(__dirname,'../..'),run=process.argv[2]||'baseline';
const fixture=fs.readFileSync(path.join(root,'qa/fm05-controlled-diagnostic/subtitle.mp4'));
const producerFiles=['media/general-player.mjs','media/general-pipeline.mjs','media/general-owner.mjs','media/general-worker.mjs'];
const hashes=()=>Object.fromEntries(producerFiles.map(file=>[file,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex')]));
const report={scope:'Local generated AVC/AAC/tx3g fixture and native ephemeral headless Chrome. No account/device/user profile/cloud writes.',run,fixture:{bytes:fixture.length,sha256:crypto.createHash('sha256').update(fixture).digest('hex')},producerStart:hashes(),serverClosed:false,browserClosed:false};
const save=()=>fs.writeFileSync(path.join(__dirname,run+'-results.json'),JSON.stringify(report,null,2));
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/qa-endpoint'){res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'});return res.end('<!doctype html><html><title>Native endpoint QA</title><body><video id="native" width="320" height="180" muted controls></video><video id="q1" width="320" height="180" muted controls></video></body></html>');}
 const file=path.resolve(root,'.'+url.pathname);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||fs.statSync(file).isDirectory())return res.writeHead(404).end();
 const bytes=fs.readFileSync(file),m=/bytes=(\d+)-(\d*)/.exec(req.headers.range||''),start=m?+m[1]:0,end=m&&m[2]?Math.min(+m[2],bytes.length-1):bytes.length-1;
 if(start<0||start>=bytes.length||end<start)return res.writeHead(416).end();
 const type={'.mjs':'text/javascript','.js':'text/javascript','.mp4':'video/mp4'}[path.extname(file)]||'application/octet-stream';
 res.writeHead(m?206:200,{'Content-Type':type,'Cache-Control':'no-store','Content-Length':end-start+1,'Accept-Ranges':'bytes',...(m?{'Content-Range':`bytes ${start}-${end}/${bytes.length}`}:{})});res.end(bytes.subarray(start,end+1));
});
(async()=>{let browser,page;try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
 browser=await chromium.launch({channel:'chrome',headless:true});report.browserVersion=browser.version();const context=await browser.newContext({viewport:{width:900,height:400}});
 await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
 page=await context.newPage();report.pageErrors=[];page.on('pageerror',e=>report.pageErrors.push(e.message));await page.goto(origin+'/qa-endpoint');
 report.result=await page.evaluate(async({size,run})=>{
  const originalMS=window.MediaSource,mse=[],history=[],sources=[],events=[],frames=[];
  const video=document.getElementById('q1'),native=document.getElementById('native');let playingCount=0;video.addEventListener('playing',()=>playingCount++);
  const ranges=thing=>Array.from({length:thing.buffered.length},(_,i)=>[thing.buffered.start(i),thing.buffered.end(i)]);
  const snapshot=(stage)=>({stage,time:video.currentTime,readyState:video.readyState,seeking:video.seeking,paused:video.paused,duration:video.duration,frames:video.getVideoPlaybackQuality().totalVideoFrames,videoBuffered:ranges(video),mse:mse.map(media=>({readyState:media.readyState,duration:media.duration,buffers:Array.from(media.sourceBuffers,sb=>({ranges:ranges(sb),timestampOffset:sb.timestampOffset,appendWindowStart:sb.appendWindowStart,appendWindowEnd:sb.appendWindowEnd}))}))});
  window.MediaSource=class extends originalMS {constructor(){super();mse.push(this);}addSourceBuffer(mime){const sb=super.addSourceBuffer(mime);sb.addEventListener('updateend',()=>history.push(snapshot('updateend')));return sb;}endOfStream(...args){history.push(snapshot('before-endOfStream'));const result=super.endOfStream(...args);history.push(snapshot('after-endOfStream'));return result;}removeSourceBuffer(sb){history.push(snapshot('before-removeSourceBuffer'));return super.removeSourceBuffer(sb);}};
  function watch(v,collection){let active=true;function frame(_,metadata){collection.push({...metadata,elementTime:v.currentTime});if(active)v.requestVideoFrameCallback(frame);}v.requestVideoFrameCallback(frame);return()=>active=false;}
  const nativeFrames=[],stopNative=watch(native,nativeFrames),stopQ1=watch(video,frames);
  const waitEvent=(v,event,action)=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('QA_'+event+'_TIMEOUT')),8000);v.addEventListener(event,()=>{clearTimeout(timer);resolve();},{once:true});action();});
  const pixelBuffers=new Map();
  async function pixels(v){if(v.readyState<2)return null;const c=document.createElement('canvas');c.width=v.videoWidth;c.height=v.videoHeight;const ctx=c.getContext('2d');ctx.drawImage(v,0,0);const data=ctx.getImageData(0,0,c.width,c.height).data;pixelBuffers.set(v.id,data);return {width:c.width,height:c.height,sha256:Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),x=>x.toString(16).padStart(2,'0')).join(''),png:c.toDataURL()};}
  function pixelDifference(){const a=pixelBuffers.get('native'),b=pixelBuffers.get('q1');if(!a||!b||a.length!==b.length)return null;let pixels=0,channels=0,max=0,squared=0,absolute=0;for(let p=0;p<a.length;p+=4){let different=false;for(let c=0;c<3;c++){const d=Math.abs(a[p+c]-b[p+c]);if(d){different=true;channels++;}max=Math.max(max,d);squared+=d*d;absolute+=d;}if(different)pixels++;}const count=a.length/4*3,mse=squared/count;return {differentPixels:pixels,totalPixels:a.length/4,differentChannels:channels,maxChannelDelta:max,meanAbsoluteChannelDelta:absolute/count,mse,psnr:mse?10*Math.log10(255**2/mse):null,exact:pixels===0};}
  await waitEvent(native,'loadeddata',()=>{native.src='/qa/fm05-controlled-diagnostic/subtitle.mp4';native.load();});
  await waitEvent(native,'seeked',()=>native.currentTime=5.999999);await new Promise(r=>setTimeout(r,80));const nativeEnd={time:native.currentTime,duration:native.duration,frames:nativeFrames,pixels:await pixels(native)};
  const {createGeneralPlayer}=await import('/media/general-player.mjs');
  const openSource=async()=>{let active=true,aborts=0;const reads=[],controllers=new Set(),record={reads,get aborts(){return aborts;},get active(){return active;}};sources.push(record);
   return {identity:{size,fileId:'synthetic',headRevisionId:'A'},async read({start,end}){if(!active)throw Error('QA_RETIRED_SOURCE');const controller=new AbortController();controllers.add(controller);reads.push([start,end]);try{const response=await fetch('/qa/fm05-controlled-diagnostic/subtitle.mp4',{headers:{Range:`bytes=${start}-${end}`},signal:controller.signal});return new Uint8Array(await response.arrayBuffer());}finally{controllers.delete(controller);}},async abort(){if(active){active=false;aborts++;for(const c of controllers)c.abort();}return{settled:controllers.size===0};}};};
  const player=createGeneralPlayer({video,openSource,isCurrent:()=>true,initialTime:5.999999,autoplay:false,selectedAudioTrackId:2,onEvent(event){events.push(event);history.push(snapshot('event-'+event.type));}});
  let ready,error;try{ready=await player.ready;}catch(e){error=e.message;}await player.completion();await new Promise(r=>setTimeout(r,80));const end={ready,error,stats:player.stats(),observed:snapshot('end-result'),frames:[...frames],pixels:await pixels(video)};const pixelOracle=pixelDifference();
  let back,exact,autoplay;
  if(!error&&run!=='baseline'){
   const mapping=await player.seek(2,{autoplay:false});await player.completion();await new Promise(r=>setTimeout(r,80));back={mapping,stats:player.stats(),observed:snapshot('backseek'),pixels:await pixels(video)};
   try{const mapping=await player.seek(6,{autoplay:false});await player.completion();await new Promise(r=>setTimeout(r,80));exact={mapping,stats:player.stats(),observed:snapshot('exact-source-end'),frames:[...frames],pixels:await pixels(video)};}catch(e){exact={error:e.message,stats:player.stats(),observed:snapshot('exact-source-end-failure')};}
   const previousPlaying=playingCount;try{const mapping=await player.seek(6,{autoplay:true});await player.completion();await new Promise(r=>setTimeout(r,run==='autoplay-window'?1000:80));autoplay={mapping,stats:player.stats(),observed:snapshot('autoplay-source-end'),playingEvents:playingCount-previousPlaying,ended:video.ended};}catch(e){autoplay={error:e.message,stats:player.stats(),observed:snapshot('autoplay-source-end-failure')};}
  }
  const cleanup=await player.dispose();stopNative();stopQ1();native.pause();native.removeAttribute('src');native.load();return {nativeEnd,end,back,exact,autoplay,pixelOracle,history,events,sources:sources.map(s=>({reads:s.reads,aborts:s.aborts,active:s.active})),cleanup,final:{hasSource:video.hasAttribute('src'),nativeHasSource:native.hasAttribute('src')}};
 },{size:fixture.length,run});for(const [name,value]of Object.entries({native:report.result.nativeEnd,q1:report.result.end,exact:report.result.exact,back:report.result.back})){if(value?.pixels?.png){fs.writeFileSync(path.join(__dirname,run+'-'+name+'-frame.png'),Buffer.from(value.pixels.png.split(',')[1],'base64'));delete value.pixels.png;}}save();
 if(run!=='baseline'){assert.equal(report.result.end.error,undefined);if(run==='fixed'){assert.equal(report.result.end.pixels.sha256,report.result.nativeEnd.pixels.sha256);assert.equal(report.result.exact.pixels.sha256,report.result.nativeEnd.pixels.sha256);}assert.equal(report.result.exact.error,undefined);assert.equal(report.result.back.stats.failure,null);assert.equal(report.result.autoplay.error,undefined);assert.equal(report.result.autoplay.stats.failure,null);assert.ok(report.result.autoplay.playingEvents>0);if(run==='autoplay-window'){assert.equal(report.result.autoplay.ended,true);assert.equal(report.result.autoplay.observed.paused,true);}assert.equal(report.result.cleanup.settled,true);assert.equal(report.result.final.hasSource,false);assert.ok(report.result.sources.every(s=>s.aborts===1&&!s.active));}
 report.passed=run==='baseline'?report.result.end.error==='GENERAL_NO_PRESENTABLE_TARGET':true;report.producersUnchanged=JSON.stringify(report.producerStart)===JSON.stringify(hashes());assert.ok(report.producersUnchanged);save();
 }catch(error){report.failure={message:error.message,stack:error.stack};save();process.exitCode=1;}finally{await browser?.close();report.browserClosed=true;await new Promise(r=>server.close(r));report.serverClosed=true;save();}
 console.log(JSON.stringify({run,passed:report.passed,error:report.result?.end?.error,end:report.result?.end?.observed,cleanup:report.result?.cleanup,failure:report.failure}));
})();
