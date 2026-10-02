'use strict';
// One native Android local endpoint probe; candidate playback/account untouched.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto'),cp=require('node:child_process');
const {chromium}=require('../node_modules/playwright'),common=require('./android-common33.cjs');
const root=path.resolve(__dirname,'../..'),sha=b=>crypto.createHash('sha256').update(b).digest('hex'),name='android-endpoint-ab-actual-safe.json',pin='09c61bdc1438df24e4213e348caea745823b5ee1';
if(process.argv[2]!=='--execute')throw Error('EXPLICIT_EXECUTE_REQUIRED');
if(fs.existsSync(path.join(__dirname,name)))throw Error('RECEIPT_ALREADY_EXISTS');
if(sha(fs.readFileSync(path.join(__dirname,'android-common33.cjs')))!=='c71347f648053cb94d5954257f6be7ecc37ca36760889bacd072b80beac6f783')throw Error('COMMON_PIN');
const template=fs.readFileSync(path.join(__dirname,'endpoint-ab.cjs'),'utf8');if(sha(template)!=='c6c3763ec3ccee71840262cfd63b358867b4399d5190e94006b8cb384ab523f9')throw Error('TEMPLATE_PIN');
const begin='return page.evaluate(async({endpoint,level})=>{',end=' },{endpoint,level});',a=template.indexOf(begin),b=template.indexOf(end,a);if(a<0||b<a||template.indexOf(begin,a+1)>=0)throw Error('SETUP_ANCHOR');
const setupBody=template.slice(a+begin.length,b);
const product=cp.execFileSync('git',['show',`${pin}:media/general-player.mjs`],{cwd:root,maxBuffer:1048576}).toString(),ea=product.indexOf('  const endEvents='),eb=product.indexOf('  const mediaError=',ea),endpoint=product.slice(ea,eb);
if(ea<0||eb<ea||sha(endpoint)!=='beb141ddeb2f420ad7d29f89a633175f76f648ca673a35a1c35ef8c6a0715742')throw Error('ENDPOINT_PIN');
const input=fs.readFileSync(path.join(root,'qa/q3-full-output-quality/output-640-180s.mp4'));if(input.length!==66640685||sha(input)!=='13daa94f723a7af036c709892d2640d018f271b4d1c0a5a90fbd37ad99ea5ad2')throw Error('INPUT_PIN');
const html='<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><video width="640" height="360"></video><button id="play" style="display:block;width:200px;height:52px">Native play</button>';
const bounded=(p,ms,code)=>new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error(code)),ms);p.then(x=>{clearTimeout(t);resolve(x);},e=>{clearTimeout(t);reject(e);});});
common(__filename,name,async c=>{
 const r=c.report;r.scope='Same installed Android engine local MSE endpoint A/B; no Drive/source/encoder/acceptance';r.templateSha256=sha(template);r.endpointSha256=sha(endpoint);r.input={bytes:input.length,sha256:sha(input)};r.cases=[];r.localCleanup={};
 let browser,page,session,server,reverse=false,forward,deadlineTimer,start,origin,candidate;
 try{
  await c.unmaskNativeVisibility();await c.releaseMcpForNativeLifecycle();
  server=http.createServer((req,res)=>{if(req.method!=='GET'||req.headers.host!==`127.0.0.1:${server.address().port}`)return res.writeHead(403).end();if(req.url==='/')return res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'}).end(html);if(req.url==='/program.mp4')return res.writeHead(200,{'Content-Type':'video/mp4','Content-Length':input.length,'Cache-Control':'no-store'}).end(input);res.writeHead(404).end();});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port,remote=`tcp:${port}`;origin=`http://127.0.0.1:${port}`;
  if(c.adb(['reverse','--list']).split(/\r?\n/).some(line=>line.split(/\s+/).includes(remote)))throw Error('REVERSE_ALREADY_OWNED');
  c.adb(['reverse',remote,remote]);reverse=true;
  forward=Number(c.adb(['forward','tcp:0','localabstract:chrome_devtools_remote']));browser=await chromium.connectOverCDP(`http://127.0.0.1:${forward}`);
  const candidates=browser.contexts().flatMap(ctx=>ctx.pages()).filter(p=>p.url().startsWith('https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev/'));if(candidates.length!==1)throw Error('CANDIDATE_COUNT');candidate=candidates[0];
  const baseline=await candidate.evaluate(()=>({idle:el.playerSheet.hidden&&state.selected===null&&!q0Playback&&!q1Playback&&q1RetirementResult?.settled===true,version:APP_VERSION,accountPresent:!!state.authAccountKey}));r.candidateBefore=baseline;if(!baseline.idle||baseline.version!=='1.22.0-rc.34'||!baseline.accountPresent)throw Error('CANDIDATE_NOT_IDLE');
  page=await candidate.context().newPage();session=await page.context().newCDPSession(page);await session.send('Emulation.setFocusEmulationEnabled',{enabled:false});
  start=Date.now();deadlineTimer=setTimeout(()=>{r.observationDeadlineReached=true;void page.close();},60000);
  for(const level of ['Q3','Q2']){
   const record={level};r.cases.push(record);await page.goto(origin+'/',{timeout:7000});await page.bringToFront();
   record.admission=await bounded(page.evaluate(`(async({endpoint,level})=>{${setupBody}})(${JSON.stringify({endpoint,level})})`),15000,'LOCAL_MSE_SETUP_BOUND');
   const geometry=await page.evaluate(()=>{const n=document.querySelector('#play'),b=n.getBoundingClientRect(),x=b.x+b.width/2,y=b.y+b.height/2;return {owned:location.pathname==='/'&&!!window.owned,visible:document.visibilityState==='visible',width:innerWidth,height:innerHeight,dpr:devicePixelRatio,screenHeight:screen.height*devicePixelRatio,x,y,hit:document.elementFromPoint(x,y)===n};});
   if(!geometry.owned||!geometry.visible||!geometry.hit||geometry.width!==824||geometry.dpr!==2.125||c.report.physicalScreen!=='Physical size: 1752x2800')throw Error('NATIVE_GEOMETRY');
   const x=Math.round(geometry.x*geometry.dpr),y=Math.round(2800-geometry.height*geometry.dpr+geometry.y*geometry.dpr);record.geometry={...geometry,physicalX:x,physicalY:y};if(x<0||x>=1752||y<0||y>=2800)throw Error('INPUT_SCREEN_BOUND');
   c.step('native-local-play-before',{level});record.startedMs=Date.now()-start;c.adb(['shell','input','tap',String(x),String(y)]);c.step('native-local-play-after',{level});
   await bounded(page.waitForFunction(()=>window.owned.read().final.ended,{timeout:8000}),8500,'NATIVE_ENDPOINT_BOUND');await page.waitForTimeout(750);
   record.result=await page.evaluate(()=>window.owned.read());record.observationMs=Date.now()-start-record.startedMs;if(!record.result.playTrusted||record.result.playError)throw Error('NATIVE_PLAY_NOT_ADMITTED');
   record.cleanup=await page.evaluate(()=>window.owned.clear());c.step('endpoint-case',{level,endedProperty:record.result.final.ended,trustedEnded:record.result.events.some(e=>e.type==='ended'&&e.trusted),sourceEnded:record.result.sourceEnded});
  }
  r.endpointCompleted=true;
 }catch(e){r.endpointCompleted=false;if(page&&!page.isClosed())try{r.partial=await bounded(page.evaluate(()=>window.owned?.read()||null),2000,'PARTIAL_BOUND');}catch{}throw Error(/^[A-Z0-9_]+$/.test(e.message)?e.message:'LOCAL_ENDPOINT_OPERATION_FAILED');}
 finally{
  clearTimeout(deadlineTimer);r.localCleanup.deadlineCleared=true;
  if(page&&!page.isClosed()){try{if(page.url()===origin+'/')r.localCleanup.page=await bounded(page.evaluate(()=>window.owned?.clear()||{holderAbsent:true}),2000,'PAGE_CLEANUP_BOUND');}catch{r.localCleanup.pageClearUnconfirmed=true;}try{if(session)await session.detach();r.localCleanup.localSessionDetached=true;await page.close();r.localCleanup.ownedTabClosed=true;}catch{r.localCleanup.ownedTabClosed=false;}}else if(page)r.localCleanup.ownedTabClosed=true;
  if(candidate&&!candidate.isClosed())try{await candidate.bringToFront();r.candidateAfter=await candidate.evaluate(()=>({idle:el.playerSheet.hidden&&state.selected===null&&!q0Playback&&!q1Playback&&q1RetirementResult?.settled===true,version:APP_VERSION,accountPresent:!!state.authAccountKey,visible:document.visibilityState==='visible'}));r.localCleanup.candidateForegroundRestored=r.candidateAfter.idle&&r.candidateAfter.visible&&r.candidateAfter.version==='1.22.0-rc.34';}catch{r.localCleanup.candidateForegroundRestored=false;}
  if(browser){await browser.close();r.localCleanup.localCdpDisconnected=!browser.isConnected();}
  if(forward)try{c.adb(['forward','--remove',`tcp:${forward}`]);r.localCleanup.localForwardRemoved=true;}catch{r.localCleanup.localForwardRemoved=false;}
  if(reverse)try{c.adb(['reverse','--remove',`tcp:${server.address().port}`]);r.localCleanup.ownedReverseRemoved=true;}catch{r.localCleanup.ownedReverseRemoved=false;}
  if(server?.listening){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));r.localCleanup.serverClosed=true;}
  r.observationTotalMs=start?Date.now()-start:null;if(r.localCleanup.ownedTabClosed===false||r.localCleanup.candidateForegroundRestored===false||r.localCleanup.localForwardRemoved===false||r.localCleanup.ownedReverseRemoved===false)throw Error('LOCAL_OWNED_CLEANUP_UNCONFIRMED');
 }
});
