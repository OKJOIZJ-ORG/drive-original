'use strict';
// Local native endpoint discrimination only. No app/account/device/source I/O.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto'),cp=require('node:child_process');
const {chromium}=require('../node_modules/playwright');
const root=path.resolve(__dirname,'../..'),pin='09c61bdc1438df24e4213e348caea745823b5ee1',sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const outputPath=path.join(__dirname,'endpoint-ab-actual-safe.json');
if(fs.existsSync(outputPath))throw Error('RECEIPT_ALREADY_EXISTS');
const input=fs.readFileSync(path.join(root,'qa/q3-full-output-quality/output-640-180s.mp4'));
if(input.length!==66640685||sha(input)!=='13daa94f723a7af036c709892d2640d018f271b4d1c0a5a90fbd37ad99ea5ad2')throw Error('INPUT_PIN');
const product=cp.execFileSync('git',['show',`${pin}:media/general-player.mjs`],{cwd:root,maxBuffer:1048576}).toString();
const a=product.indexOf('  const endEvents='),b=product.indexOf('  const mediaError=',a);
if(a<0||b<=a||product.indexOf('  const endEvents=',a+1)>=0)throw Error('ENDPOINT_ANCHOR');
const endpoint=product.slice(a,b);
const host=JSON.parse(cp.execFileSync('powershell.exe',['-NoProfile','-Command','Get-CimInstance Win32_OperatingSystem | Select-Object FreePhysicalMemory,FreeVirtualMemory | ConvertTo-Json -Compress'],{encoding:'utf8',windowsHide:true}));
if(host.FreePhysicalMemory<1048576||host.FreeVirtualMemory<2097152)throw Error('MEMORY_ADMISSION');
const report={schema:1,scope:'Actual isolated desktop native MSE endpoint A/B; Android/native installed revision and pixel/performance acceptance excluded',runtimeSource:pin,producerSha256:sha(fs.readFileSync(__filename)),endpointSha256:sha(endpoint),input:{bytes:input.length,sha256:sha(input),duration:180,codec:'vp09.00.41.08'},host,cases:[],errors:[],cleanup:{},started:new Date().toISOString()};
const html='<!doctype html><meta charset="utf-8"><video width="640" height="360"></video><button id="play">Native play</button>';
let browser,context,page,deadlineTimer,observationStart;
const server=http.createServer((req,res)=>{if(req.method!=='GET'||req.headers.host!==`127.0.0.1:${server.address().port}`)return res.writeHead(403).end();if(req.url==='/')return res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'}).end(html);if(req.url==='/program.mp4')return res.writeHead(200,{'Content-Type':'video/mp4','Content-Length':input.length,'Cache-Control':'no-store'}).end(input);res.writeHead(404).end();});
const bounded=(promise,ms,code)=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error(code)),ms);promise.then(x=>{clearTimeout(timer);resolve(x);},e=>{clearTimeout(timer);reject(e);});});
async function browserSetup(level){
 await page.goto(`http://127.0.0.1:${server.address().port}/`,{timeout:5000});
 return page.evaluate(async({endpoint,level})=>{
  const video=document.querySelector('video'),events=[],sourceEvents=[],sample=()=>({time:video.currentTime,duration:video.duration,ended:video.ended,paused:video.paused,rate:video.playbackRate,loop:video.loop,ready:video.readyState,error:video.error?.code||null});
  let endTimer=null,sourceEnded=false,positioned=false,mapping={sourceEnd:180,commonShift:0},state={status:{level}},alive=true;
  const current=()=>alive,emit=(type,details)=>sourceEvents.push({type,...details,...sample(),at:performance.now()}),media=new MediaSource(),url=URL.createObjectURL(media),listeners=[];
  const log=e=>{if(events.length<128)events.push({type:e.type,trusted:e.isTrusted,...sample(),at:performance.now()});};
  video.loop=false;video.playbackRate=1;video.src=url;
  for(const type of ['timeupdate','playing','pause','seeked','ended','error']){video.addEventListener(type,log);listeners.push([type,log]);}
  const nativeEndpoint=new Function('video','current','mapping','state','emit','positioned','scope',`let endTimer=null,sourceEnded=false;${endpoint}\n scope.add(endEvents,enforceSourceEnd);scope.clear=()=>{clearTimeout(endTimer);};scope.source=()=>sourceEnded;`);
  // The exact closure gets positioned=true only after native MSE/seek admission.
  await new Promise((resolve,reject)=>{media.addEventListener('sourceopen',resolve,{once:true});video.addEventListener('error',()=>reject(Error('SOURCE_OPEN_ERROR')),{once:true});});
  const mime='video/mp4; codecs="vp09.00.41.08"';if(!MediaSource.isTypeSupported(mime))throw Error('MIME_UNSUPPORTED');
  const sb=media.addSourceBuffer(mime),bytes=await(await fetch('/program.mp4')).arrayBuffer();
  await new Promise((resolve,reject)=>{sb.addEventListener('updateend',resolve,{once:true});sb.addEventListener('error',()=>reject(Error('APPEND_ERROR')),{once:true});sb.appendBuffer(bytes);});
  media.endOfStream();await new Promise((resolve,reject)=>{if(video.readyState>=1)return resolve();video.addEventListener('loadedmetadata',resolve,{once:true});video.addEventListener('error',()=>reject(Error('METADATA_ERROR')),{once:true});});
  const ranges=Array.from({length:video.buffered.length},(_,i)=>[video.buffered.start(i),video.buffered.end(i)]);
  if(Math.abs(video.duration-180)>.05||!ranges.some(([a,b])=>a<=178&&b>=179.9))throw Error('MSE_DURATION_RANGE');
  await new Promise(resolve=>{video.addEventListener('seeked',resolve,{once:true});video.currentTime=178;});
  positioned=true;const scope={add(types,fn){for(const type of types){video.addEventListener(type,fn);listeners.push([type,fn]);}}};
  nativeEndpoint(video,current,mapping,state,emit,positioned,scope);
  const playButton=document.querySelector('#play'),play=e=>{if(!e.isTrusted)throw Error('PLAY_NOT_TRUSTED');window.owned.playTrusted=true;video.play().catch(e=>window.owned.playError=e.name);};
  playButton.addEventListener('click',play);
  window.owned={level,events,sourceEvents,ranges,mime,playTrusted:false,read(){return {level,events,sourceEvents,ranges,mime,playTrusted:this.playTrusted,playError:this.playError||null,final:sample(),mediaReadyState:media.readyState,sourceEnded:scope.source(),quality:video.getVideoPlaybackQuality?(()=>{const q=video.getVideoPlaybackQuality();return {total:q.totalVideoFrames,dropped:q.droppedVideoFrames,corrupted:q.corruptedVideoFrames};})():null};},clear(){alive=false;scope.clear();for(const [type,fn] of listeners)video.removeEventListener(type,fn);playButton.removeEventListener('click',play);video.pause();video.removeAttribute('src');video.load();URL.revokeObjectURL(url);delete window.owned;return {listenersRemoved:true,endpointTimerCleared:true,blobRevoked:true,mediaDetached:true,holderCleared:true};}};
  return {level,duration:video.duration,seek:video.currentTime,ranges,mime};
 },{endpoint,level});
}
(async()=>{try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=await chromium.launch({channel:'chrome',headless:true,timeout:15000});report.browserVersion=browser.version();report.profile='Playwright-owned ephemeral context; no existing profile';context=await browser.newContext();page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
 observationStart=Date.now();deadlineTimer=setTimeout(()=>{report.deadlineReached=true;void browser.close();},30000);
 for(const level of ['Q3','Q2']){
  const record={level};report.cases.push(record);record.admission=await bounded(browserSetup(level),8000,'SETUP_BOUND');record.started=Date.now()-observationStart;await page.locator('#play').click({timeout:3000});
  await bounded(page.waitForFunction(()=>window.owned.read().final.ended,{timeout:6500}),7000,'NATIVE_ENDPOINT_BOUND');
  await page.waitForTimeout(750);record.result=await page.evaluate(()=>window.owned.read());record.observationMs=Date.now()-observationStart-record.started;record.cleanup=await page.evaluate(()=>window.owned.clear());
  console.log(JSON.stringify({stage:'endpoint-case',level,endedProperty:record.result.final.ended,trustedEnded:record.result.events.some(e=>e.type==='ended'&&e.trusted),pause:record.result.events.filter(e=>e.type==='pause').length,sourceEnded:record.result.sourceEnded}));
 }
 report.completed=true;
}catch(e){report.failure=e.message;report.completed=false;if(page&&!page.isClosed())try{report.partial=await page.evaluate(()=>window.owned?.read()||null);}catch{};
}finally{
 clearTimeout(deadlineTimer);report.cleanup.deadlineCleared=true;
 if(page&&!page.isClosed())try{report.cleanup.page=await bounded(page.evaluate(()=>window.owned?.clear()||{holderAbsent:true}),2000,'PAGE_CLEANUP_BOUND');}catch(e){report.cleanup.pageError=e.message;}
 if(context)try{await context.close();report.cleanup.contextClosed=true;}catch(e){report.cleanup.contextError=e.message;}
 if(browser){await browser.close();report.cleanup.browserClosed=!browser.isConnected();}
 if(server.listening){server.closeAllConnections();await new Promise(r=>server.close(r));report.cleanup.serverClosed=true;}
 report.observationTotalMs=observationStart?Date.now()-observationStart:null;report.ended=new Date().toISOString();fs.writeFileSync(outputPath,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({completed:report.completed,failure:report.failure,observationTotalMs:report.observationTotalMs,cleanup:report.cleanup,receiptSha256:sha(fs.readFileSync(outputPath))}));if(!report.completed)process.exitCode=1;
}})();
