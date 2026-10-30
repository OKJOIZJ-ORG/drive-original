'use strict';
// Isolated Chrome + public synthetic TS. No app/authentication/production access.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process'),{createHash}=require('node:crypto');
const root=path.resolve(__dirname,'..');
const {chromium}=require(require.resolve('playwright',{paths:[path.join(root,'qa/v2-07b-ts-q1')]}));
const hash=b=>createHash('sha256').update(b).digest('hex');
const baselineRef='adbe705388c3cf6c3ad15984939f85eee34d7f52';
const baseline=execFileSync('git',['show',`${baselineRef}:media/ts-player.mjs`],{cwd:root});
const fixtures={long:fs.readFileSync(path.join(root,'qa/q1-general-product-preparation/long.ts')),short:fs.readFileSync(path.join(root,'qa/v2-07b-ts-q1/synthetic-bframes-audiolead.ts'))};
const out=path.join(__dirname,'buffering-20261030');fs.mkdirSync(out,{recursive:true});
const result={started:new Date().toISOString(),baselineCommit:baselineRef,sourceHashes:{baseline:hash(baseline),current:hash(fs.readFileSync(path.join(root,'media/ts-player.mjs')))},fixtureHashes:Object.fromEntries(Object.entries(fixtures).map(([k,v])=>[k,hash(v)])),runs:[],errors:[]};
const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost'),p=url.pathname;
 if(p==='/')return res.writeHead(200,{'Content-Type':'text/html'}).end('<video muted style="width:640px" id="video"></video>');
 const media=/^\/(baseline|current)\/(media\/[\w.-]+)$/.exec(p);
 if(media){const file=path.join(root,media[2]);if(!fs.existsSync(file))return res.writeHead(404).end();return res.writeHead(200,{'Content-Type':'text/javascript','Cache-Control':'no-store'}).end(media[1]==='baseline'&&media[2]==='media/ts-player.mjs'?baseline:fs.readFileSync(file));}
 if(p==='/bytes'){const bytes=fixtures[url.searchParams.get('fixture')],start=+url.searchParams.get('start'),end=+url.searchParams.get('end'),delay=+url.searchParams.get('delay');
 const timer=setTimeout(()=>res.writeHead(206,{'Content-Type':'video/mp2t','Content-Length':end-start+1,'Content-Range':`bytes ${start}-${end}/${bytes.length}`}).end(bytes.subarray(start,end+1)),delay);res.on('close',()=>clearTimeout(timer));return;}
 res.writeHead(404).end();
});
let browser;
async function start(page,variant,fixture,delayed){
 await page.goto(origin);await page.evaluate(async({variant,fixture,delayed,size,sha256})=>{
  window.errors=[];window.calls=[];window.events=[];window.fragments=[];window.inputs=[];
  const digest=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b))).map(x=>x.toString(16).padStart(2,'0')).join('');
  const Native=Worker;window.Worker=class extends Native{constructor(...args){super(...args);this.addEventListener('message',({data})=>{if(data?.type==='fragment'&&data.bytes instanceof ArrayBuffer){const size=data.bytes.byteLength;window.fragments.push(digest(data.bytes.slice(0)).then(sha256=>({sha256,size})));}});}postMessage(data,...args){if(data?.type==='input')window.inputs.push(data.bytes.byteLength);return super.postMessage(data,...args);}};
  const {createTsPlayer}=await import(`/${variant}/media/ts-player.mjs`),{openDriveQ1Source}=await import(`/${variant}/media/drive-source.mjs`);
  const sleep=(ms,signal)=>new Promise((resolve,reject)=>{const done=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);resolve();},abort=()=>{clearTimeout(timer);reject(new DOMException('aborted','AbortError'));},timer=setTimeout(done,ms);signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();});
  const metadata={id:'synthetic-ts',mimeType:'video/mp2t',size:String(size),headRevisionId:'synthetic-revision',version:'1',modifiedTime:'2026-10-30T00:00:00Z',sha256Checksum:sha256,trashed:false,capabilities:{canDownload:true}};
  window.current=true;window.video=document.querySelector('video');video.playbackRate=2;
  ['waiting','playing','pause','ended','error'].forEach(type=>video.addEventListener(type,()=>events.push({type,wall:performance.now(),time:video.currentTime})));
  window.player=createTsPlayer({video,isCurrent:()=>current,autoplay:false,openSource:({signal})=>openDriveQ1Source({fileId:'synthetic-ts',accountKey:'synthetic',accountGeneration:1,isCurrent:()=>current,signal,
   readMetadata:async({signal,phase})=>{calls.push({kind:'metadata',phase,wall:performance.now()});await sleep(delayed?450:0,signal);return metadata;},
   readRange:async({start,end,signal})=>{const row={kind:'range',start,end,size:end-start+1,wall:performance.now()};calls.push(row);const response=await fetch(`/bytes?fixture=${fixture}&start=${start}&end=${end}&delay=${delayed?900+(end-start+1)/1048576*1000:0}`,{signal});row.returned=performance.now();return response;}
  })});window.ready=player.ready;window.ready.catch(e=>errors.push(e.message));
 },{variant,fixture,delayed,size:fixtures[fixture].length,sha256:result.fixtureHashes[fixture]});
 if(fixture==='short')await page.evaluate(()=>ready);else await page.waitForFunction(()=>player.stats().window.waits>0||player.stats().failure||player.stats().phase==='ended',null,{timeout:70000});
 assert.equal(await page.evaluate(()=>player.stats().failure),null);
}
async function snapshot(page){return page.evaluate(async()=>({time:video.currentTime,ended:video.ended,paused:video.paused,stats:player.stats(),calls,events,errors,inputs,fragments:await Promise.all(fragments)}));}
let origin;
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));origin=`http://127.0.0.1:${server.address().port}`;result.origin=origin;browser=await chromium.launch({channel:'chrome',headless:true});
 for(const variant of ['baseline','current']){
  const page=await browser.newPage();page.on('pageerror',e=>result.errors.push({variant,message:e.message}));
  await start(page,variant,'long',true);const warm=await snapshot(page);
  await page.waitForTimeout(1200);const before=await snapshot(page);await page.waitForTimeout(1200);const paused=await snapshot(page);
  assert.equal(paused.calls.filter(x=>x.kind==='range').length,before.calls.filter(x=>x.kind==='range').length,'PAUSE_BACKPRESSURE');
  const runStart=await page.evaluate(async()=>{await video.play();return performance.now();});await page.waitForTimeout(45000);const played=await snapshot(page);
  await page.evaluate(()=>video.pause());const close=await page.evaluate(()=>player.dispose());const stopped=await snapshot(page);await page.waitForTimeout(1200);const post=await snapshot(page);
  assert.equal(post.calls.length,stopped.calls.length,'CLOSE_NEW_REQUEST');assert.equal(close.settled,true);assert.equal(stopped.stats.urlRevoked,true);assert.equal(stopped.stats.worker.terminated,true);
  result.runs.push({variant,scenario:'delayed-long-2x',warm,runStart,played,close,stopped,postCloseCallCount:post.calls.length});await page.close();fs.writeFileSync(path.join(out,'synthetic-results.json'),JSON.stringify(result,null,2));
 }
 // No latency: compare exact transmuxed payload identity, EOF and seek lifecycle.
 for(const variant of ['baseline','current']){const page=await browser.newPage();await start(page,variant,'short',false);
  await page.evaluate(()=>{video.playbackRate=16;return video.play();});await page.waitForFunction(()=>player.stats().phase==='ended'||player.stats().failure,null,{timeout:20000});const eof=await snapshot(page);assert.equal(eof.stats.failure,null);assert.equal(eof.stats.phase,'ended');
  await page.evaluate(()=>player.seek(4,{autoplay:false}));const sought=await snapshot(page);assert.equal(sought.stats.generation,2);assert.ok(Math.abs(sought.time-4)<.2);const cleanup=await page.evaluate(()=>player.dispose());assert.equal(cleanup.settled,true);
  result.runs.push({variant,scenario:'short-payload-eof-seek',eof,sought,cleanup});await page.close();}
 const [oldRun,newRun]=result.runs.filter(x=>x.scenario==='short-payload-eof-seek');assert.deepEqual(newRun.eof.fragments,oldRun.eof.fragments,'FRAGMENT_PAYLOAD_CHANGED');assert.ok(result.runs.every(r=>r.played?.inputs.every(n=>n<=65536)??r.eof.inputs.every(n=>n<=65536)));
 const [oldLong,newLong]=result.runs.filter(x=>x.scenario==='delayed-long-2x');assert.ok(newLong.played.time>oldLong.played.time+10,'NO_MEANINGFUL_BUFFERING_IMPROVEMENT');result.passed=true;
})().catch(e=>{result.passed=false;result.failure={message:e.message,stack:e.stack};process.exitCode=1;}).finally(async()=>{result.finished=new Date().toISOString();fs.writeFileSync(path.join(out,'synthetic-results.json'),JSON.stringify(result,null,2));await browser?.close();await new Promise(r=>server.close(r));console.log(JSON.stringify({passed:result.passed,failure:result.failure?.message,runs:result.runs.map(r=>({variant:r.variant,scenario:r.scenario,time:r.played?.time,peakAhead:r.played?.stats.window.peakAhead}))}));});
