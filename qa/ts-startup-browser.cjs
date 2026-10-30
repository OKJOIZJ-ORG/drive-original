'use strict';
// Public generated fixture, isolated Chrome, real source/TS worker/MSE lifecycle.
// Only the first physical stream read differs between the baseline and current.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process'),{createHash}=require('node:crypto');
const root=path.resolve(__dirname,'..'),out=path.join(__dirname,'ts-startup-20261030');fs.mkdirSync(out,{recursive:true});
const {chromium}=require(require.resolve('playwright',{paths:[path.join(root,'qa')]}));
const sha=b=>createHash('sha256').update(b).digest('hex');
const current=fs.readFileSync(path.join(root,'media/ts-player.mjs'),'utf8');
assert.match(current,/const readBytes=1048576;/);
const baseline=current.replace('const readBytes=1048576;','const readBytes=firstAppend?262144:1048576;');
const fixturePath=path.join(out,'synthetic-startup.ts');
execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','testsrc2=size=512x288:rate=30','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','24','-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p','-b:v','2400k','-maxrate','2400k','-bufsize','2400k','-x264-params','force-cfr=1','-g','30','-bf','2','-c:a','aac','-b:a','128k','-ac','2','-muxdelay','0','-muxpreload','0','-muxrate','3000000','-f','mpegts',fixturePath]);
const fixture=fs.readFileSync(fixturePath),result={started:new Date().toISOString(),sourceHashes:{baseline:sha(baseline),current:sha(current)},fixture:{bytes:fixture.length,sha256:sha(fixture),kind:'public generated VBR AVC/AAC with3Mbit/s TS mux padding'},transport:{metadataMs:60,rangeFixedMs:1200,rangePerMiBMs:300},runs:[],errors:[]};
const server=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://localhost');
 if(u.pathname==='/')return res.writeHead(200,{'Content-Type':'text/html'}).end('<video muted id="video"></video>');
 const match=/^\/(baseline|current)\/(media\/[\w.-]+)$/.exec(u.pathname);
 if(match){const p=path.join(root,match[2]);if(!fs.existsSync(p))return res.writeHead(404).end();return res.writeHead(200,{'Content-Type':'text/javascript','Cache-Control':'no-store'}).end(match[2]==='media/ts-player.mjs'?(match[1]==='baseline'?baseline:current):fs.readFileSync(p));}
 if(u.pathname==='/bytes'){
  const start=+u.searchParams.get('start'),end=+u.searchParams.get('end'),delayed=u.searchParams.get('delayed')==='true';
  const timer=setTimeout(()=>res.writeHead(206,{'Content-Type':'video/mp2t','Content-Length':end-start+1,'Content-Range':`bytes ${start}-${end}/${fixture.length}`}).end(fixture.subarray(start,end+1)),delayed?1200+(end-start+1)/1048576*300:0);
  res.on('close',()=>clearTimeout(timer));return;
 }
 res.writeHead(404).end();
});
let browser,origin;
async function start(page,variant,delayed){
 await page.goto(origin);await page.evaluate(async({variant,delayed,size,sha256})=>{
  window.calls=[];window.events=[];window.inputs=[];window.payloads=[];window.errors=[];
  const digest=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b))).map(x=>x.toString(16).padStart(2,'0')).join('');
  const Native=Worker;window.Worker=class extends Native{constructor(...args){super(...args);this.addEventListener('message',({data})=>{if(data?.type==='fragment')payloads.push(digest(data.bytes.slice(0)));});}postMessage(data,...args){if(data?.type==='input')inputs.push(data.bytes.byteLength);return super.postMessage(data,...args);}};
  const {createTsPlayer}=await import(`/${variant}/media/ts-player.mjs`),{openDriveQ1Source}=await import(`/${variant}/media/drive-source.mjs`);
  const sleep=(ms,signal)=>new Promise((resolve,reject)=>{const done=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);resolve();},abort=()=>{clearTimeout(timer);reject(new DOMException('aborted','AbortError'));},timer=setTimeout(done,ms);signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();});
  const metadata={id:'synthetic-startup',size:String(size),mimeType:'video/mp2t',headRevisionId:'revision1',modifiedTime:'2026-10-30T00:00:00Z',version:'1',sha256Checksum:sha256,trashed:false,capabilities:{canDownload:true}};
  window.video=document.querySelector('video');window.current=true;window.started=performance.now();video.playbackRate=delayed?1:16;
  for(const type of ['playing','waiting','ended','error'])video.addEventListener(type,()=>events.push({type,wallMs:performance.now()-started,time:video.currentTime,buffered:Array.from({length:video.buffered.length},(_,i)=>[video.buffered.start(i),video.buffered.end(i)])}));
  window.player=createTsPlayer({video,isCurrent:()=>current,autoplay:true,openSource:({signal})=>openDriveQ1Source({fileId:'synthetic-startup',accountKey:'synthetic',accountGeneration:1,isCurrent:()=>current,signal,
   readMetadata:async({signal,phase})=>{calls.push({kind:'metadata',phase,wallMs:performance.now()-started});await sleep(delayed?60:0,signal);return metadata;},
   readRange:async({start,end,signal})=>{const row={kind:'range',start,end,bytes:end-start+1,wallMs:performance.now()-started};calls.push(row);const response=await fetch(`/bytes?start=${start}&end=${end}&delayed=${delayed}`,{signal});row.returnedMs=performance.now()-started;return response;}})});
  player.ready.catch(e=>errors.push(e.message));
 },{variant,delayed,size:fixture.length,sha256:result.fixture.sha256});
}
async function snapshot(page){return page.evaluate(async()=>({time:video.currentTime,events,calls,inputs,payloads:await Promise.all(payloads),stats:structuredClone(player.stats()),errors}));}
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));origin=`http://127.0.0.1:${server.address().port}`;result.origin=origin;
 browser=await chromium.launch({channel:'chrome',headless:true});
 for(const variant of ['baseline','current']){
  const page=await browser.newPage();page.on('pageerror',e=>result.errors.push(e.message));await start(page,variant,true);
  await page.waitForFunction(()=>events.some(e=>e.type==='playing')||player.stats().failure,null,{timeout:90000});
  await page.waitForTimeout(10000);const played=await snapshot(page);assert.equal(played.stats.failure,null);
  const ranges=played.calls.filter(r=>r.kind==='range');
  assert.equal(ranges[2].start,564,'generated fixture bootstrap starts after SDT/PAT/PMT');
  assert.equal(ranges[2].bytes,variant==='baseline'?262144:1048576,'verify the actual first stream read');
  assert.ok(ranges.every(r=>r.bytes<=1048576));assert.ok(played.inputs.every(n=>n<=65536));
  const first=played.events.find(e=>e.type==='playing'),earlyWaits=played.events.filter(e=>e.type==='waiting'&&e.wallMs>first.wallMs&&e.time<5);
  const cleanup=await page.evaluate(()=>player.dispose());assert.equal(cleanup.settled,true);
  const before=await page.evaluate(()=>calls.length);await page.waitForTimeout(200);assert.equal(await page.evaluate(()=>calls.length),before);
  result.runs.push({variant,case:'delayed-start',firstPlaying:first,earlyWaits,played,cleanup});await page.close();
 }
 const [oldRun,newRun]=result.runs;assert.ok(oldRun.earlyWaits.length>0,'baseline must reproduce the startup stall');assert.equal(newRun.earlyWaits.length,0,'1MiB first read must avoid early starvation');
 for(const variant of ['baseline','current']){
  const page=await browser.newPage();await start(page,variant,false);
  await page.waitForFunction(()=>player.stats().phase==='ended'||player.stats().failure,null,{timeout:20000});
  const eof=await snapshot(page);assert.equal(eof.stats.failure,null);assert.equal(eof.stats.phase,'ended');assert.ok(eof.inputs.every(n=>n<=65536));
  await page.evaluate(()=>player.seek(7,{autoplay:false}));const seek=await snapshot(page);assert.ok(Math.abs(seek.time-7)<.2);assert.equal(seek.stats.generation,2);
  const cleanup=await page.evaluate(()=>player.dispose());assert.equal(cleanup.settled,true);
  result.runs.push({variant,case:'eof-seek-payload',eof,seek,cleanup});await page.close();
 }
 const [oldEof,newEof]=result.runs.filter(r=>r.case==='eof-seek-payload');assert.deepEqual(newEof.eof.payloads,oldEof.eof.payloads,'first read size must not alter transmuxed output');assert.deepEqual(result.errors,[]);result.passed=true;
})().catch(e=>{result.passed=false;result.failure={message:e.message,stack:e.stack};process.exitCode=1;}).finally(async()=>{result.finished=new Date().toISOString();fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(result,null,2));await browser?.close();await new Promise(r=>server.close(r));console.log(JSON.stringify({passed:result.passed,failure:result.failure?.message,runs:result.runs.map(r=>({variant:r.variant,case:r.case,firstPlaying:r.firstPlaying,earlyWaits:r.earlyWaits,time:r.played?.time}))}));});
