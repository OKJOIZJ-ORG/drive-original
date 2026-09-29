'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const helper = fs.readFileSync(path.join(root, 'media/revision-pin.js'), 'utf8');
const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const swSource = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const run = (context, expression) => vm.runInContext(expression, context);
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => {resolve=a;reject=b;}); return {promise,resolve,reject}; };
class Channel {
  constructor() {
    this.port1 = { onmessage:null, closed:false, close(){this.closed=true;} };
    this.port2 = { onmessage:null, closed:false, close(){this.closed=true;} };
    for (const [a,b] of [[this.port1,this.port2],[this.port2,this.port1]]) a.postMessage = data => queueMicrotask(() => {
      if (!b.closed) b.onmessage?.({data:structuredClone(data)});
    });
  }
}
function fixture(options = {}) {
  const calls = [], messages = [], listeners = new Map();
  let latest = 'A', revision = 1, metadataReads = 0;
  const metadata = () => ({id:'fixture',headRevisionId:latest,size:'16',mimeType:'video/mp4',modifiedTime:latest,
    sha256Checksum:latest.toLowerCase().repeat(64),trashed:false,capabilities:{canDownload:true,canReadRevisions:true}});
  const uri = 'https://www.googleapis.com/drive/v3/files/fixture/revisions/A?alt=media&opaqueGrant=synthetic';
  const operation = () => ({name:'opaque/name+value/part',done:true,response:{
    '@type':'type.googleapis.com/google.apps.drive.v3.DownloadFileResponse',downloadUri:uri,partialDownloadAllowed:true}});
  // Opaque path separators and plus must survive encoding as one complete provider name.
  const done = operation;
  const controller = {postMessage(data,ports){listeners.get('message')({data,ports,source:{id:'client'},waitUntil(){}});}};
  const storage = new Map();
  const page = {AbortController,Blob,DOMException,Headers,Map,Math,Promise,Response,Set,URL,URLSearchParams,
    MessageChannel:Channel,clearInterval,clearTimeout,setInterval,setTimeout,performance,
    console,fetch:async()=>{throw Error('Unexpected page fetch');},__DRIVE_ORIGINAL_RUNTIME__:{driveMutationsEnabled:false},
    history:{replaceState(){}},location:{href:'https://app.test/',origin:'https://app.test',pathname:'/',protocol:'https:',hash:'',search:''},
    localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)},
    navigator:{onLine:true,serviceWorker:{controller,addEventListener(){},removeEventListener(){}}},
    requestAnimationFrame:callback=>setTimeout(callback,0),document:{addEventListener(){},querySelectorAll(){return [];}}};
  page.window={addEventListener(){},removeEventListener(){},isSecureContext:true,location:page.location,matchMedia:()=>({matches:false}),setTimeout};
  page.matchMedia=page.window.matchMedia;
  vm.createContext(page);vm.runInContext(helper,page);vm.runInContext(appSource,page);
  run(page,`el.videoPlayer={hidden:true};
    state.authCapabilities={version:1,driveRead:true,driveWrite:false,appData:false};
    state.token='synthetic-1';state.expiresAt=Date.now()+3600000;state.tokenRevision=1;state.authAccountKey='account';
    state.driveSessionGeneration=1;state.mediaSession=7;mediaSourceGeneration=12;state.mediaAttempt='range';
    state.selected={id:'fixture',size:'9999',mimeType:'video/wrong'};beginQ0Playback(state.selected,7);
    requestSessionCredential=async()=>{state.tokenRevision++;state.token='synthetic-'+state.tokenRevision;return true;};`);
  const timer = (callback, ms) => setTimeout(callback, options.fastTimers && ms >= 2000
    ? (ms === 10000 ? 5 : ms >= 30000 ? 100 : 35) : ms);
  let worker = {URL,Headers,Request,Response,ReadableStream,Date,Map,Number,Boolean,TextDecoder,Uint8Array,
    AbortController,DOMException,MessageChannel:Channel,setTimeout:timer,clearTimeout,
    importScripts(name){assert.equal(name,'./media/revision-pin.js');vm.runInContext(helper,worker);},
    self:{location:{origin:'https://app.test',href:'https://app.test/sw.js'},registration:{scope:'https://app.test/'},
      addEventListener:(type,handler)=>listeners.set(type,handler),clients:{async get(id){return id==='client'?client:null;},async matchAll(){return [client];}}},
    async fetch(target,init){
      const url=new URL(target), headers=new Headers(init.headers);
      const call={url:url.href,method:init.method,headers,signal:init.signal};calls.push(call);
      if(options.fetch){const custom=await options.fetch(call,{metadata,done,metadataReads,calls});if(custom!==undefined)return custom;}
      if(url.pathname.endsWith('/download')) return Response.json(options.operation ? options.operation(done()) : done());
      if(url.pathname.includes('/operations/')) return Response.json(done());
      if(!url.searchParams.has('alt')) {metadataReads++;return Response.json(options.metadata ? options.metadata(metadata(),metadataReads) : metadata());}
      if(options.unauthorizedOnce && revision++===1) return new Response('',{status:401});
      const range=headers.get('range')||'bytes=0-15';const parsed=/bytes=(\d*)-(\d*)/.exec(range);
      const start=parsed[1]?Number(parsed[1]):16-Number(parsed[2]);const end=parsed[1]?(parsed[2]?Math.min(15,Number(parsed[2])):15):15;
      const h={'content-length':String(end-start+1),'content-type':'application/octet-stream'};
      if(!options.hiddenRange)h['content-range']=`bytes ${start}-${end}/16`;
      return new Response(new Uint8Array(end-start+1).fill(url.pathname.includes('/revisions/A')?65:66),{status:206,headers:h});
    }};
  const client={id:'client',type:'window',url:'https://app.test/',postMessage(data,ports=[]){
    messages.push(data);
    if(['Q0_OWNER_REQUEST','Q0_PIN_REQUEST','TOKEN_REQUEST'].includes(data.type)) {
      if(options.modifyMessage)data=options.modifyMessage({...data});
      if(options.modifyReply&&ports[0]) {
        const port=ports[0];ports=[{postMessage:reply=>port.postMessage(options.modifyReply(reply)),close:()=>port.close()}];
      }
      Promise.resolve(page.handleWorkerMessage({data,ports,source:controller})).catch(error=>{throw error;});
    }
  }};
  vm.createContext(worker);vm.runInContext(swSource,worker);
  return {page,worker,calls,messages,controller,uri,setLatest:value=>{latest=value;},
    request(range='bytes=0-3',signal){return run(worker,'proxyDriveMedia')(
      new Request('https://app.test/__drive_media/fixture?mediaOwner=q0&sourceGeneration=12',{headers:{range},signal}),
      new URL('https://app.test/__drive_media/fixture?mediaOwner=q0&sourceGeneration=12'),'client');},
    async retire(){return await run(page,'retireQ0Playback()');},
    async restart(){
      worker={...worker};
      worker.importScripts=name=>{assert.equal(name,'./media/revision-pin.js');vm.runInContext(helper,worker);};
      vm.createContext(worker);vm.runInContext(swSource,worker);
      this.worker=worker;
    },
    count(fragment){return calls.filter(c=>c.url.includes(fragment)).length;}};
}
test('actual page/SW first snapshot is private, overrides listing, and subsequent ranges remain revision A',async()=>{
  const f=fixture({hiddenRange:true});const first=await f.request();assert.equal(first.status,206);
  assert.equal(first.headers.get('content-range'),'bytes 0-3/16');assert.equal(first.headers.get('content-type'),'video/mp4');
  assert.deepEqual([...new Uint8Array(await first.arrayBuffer())],[65,65,65,65]);
  assert.equal(f.count('/download'),1);assert.equal(f.calls.filter(c=>!c.url.includes('alt=media')&&!c.url.includes('/download')).length,2);
  f.setLatest('B');const second=await f.request('bytes=-2');assert.deepEqual([...new Uint8Array(await second.arrayBuffer())],[65,65]);
  assert.equal(f.calls.length,5);assert.equal(f.messages.filter(m=>m.type==='TOKEN_REQUEST').every(m=>m.q0PinProtocol&&m.mediaOwner==='q0'&&m.mediaSession==='7'),true);
  assert.equal(run(f.page,'q0PinnedSource.descriptor.size'),'16');assert.equal(await f.retire().then(r=>r.settled),true);
});
test('restarted worker rebinds page-retained A without provider acquisition',async()=>{
  const f=fixture();await(await f.request()).arrayBuffer();f.setLatest('B');await f.restart();const before=f.calls.length;
  await(await f.request()).arrayBuffer();assert.equal(f.calls.length-before,1);assert.equal(f.calls.at(-1).url,f.uri);await f.retire();
});
test('401 refresh authorizes same URI and source snapshot',async()=>{
  const f=fixture({unauthorizedOnce:true});const response=await f.request();assert.equal(response.status,206);await response.arrayBuffer();
  const reads=f.calls.filter(c=>c.url.includes('alt=media'));assert.equal(reads.length,2);assert.equal(reads[0].url,reads[1].url);
  assert.notEqual(reads[0].headers.get('authorization'),reads[1].headers.get('authorization'));assert.equal(f.count('/download'),1);await f.retire();
});
for(const [name,options] of Object.entries({
  drift:{metadata:(m,n)=>n===2?{...m,headRevisionId:'B'}:m},
  headless:{metadata:m=>({...m,headRevisionId:null})},
  nonpartial:{operation:o=>({...o,response:{...o.response,partialDownloadAllowed:false}})},
  unsafeURI:{operation:o=>({...o,response:{...o.response,downloadUri:'https://evil.test/drive/v3/files/fixture/revisions/A?alt=media'}})}
}))test(`${name} fails before any original bytes without latest fallback`,async()=>{
  const f=fixture(options);const response=await f.request();assert.equal(response.status,['headless','nonpartial'].includes(name)?422:409);
  assert.equal(f.calls.some(c=>c.url.includes('alt=media')),false);assert.equal(run(f.page,'q0PinnedSource'),null);
  const error=f.messages.find(m=>m.type==='MEDIA_PROXY_ERROR');assert.equal(error.category,'source-pin');await f.retire();
});
test('wrong Q0 token tuple never authorizes provider traffic',async()=>{
  const f=fixture({modifyMessage:m=>m.type==='TOKEN_REQUEST'?{...m,mediaSession:'8'}:m});
  assert.equal((await f.request()).status,401);assert.equal(f.calls.length,0);await f.retire();
});
for(const [field,value] of [['fileId','other'],['clientId','other'],['sourceGeneration',13],['accountGeneration',-1],['accountKey',''],['mediaSession','not-a-session']])
test(`malformed private owner reply ${field} cannot start provider acquisition`,async()=>{
  const f=fixture({modifyReply:reply=>reply.type==='Q0_OWNER_RESPONSE'?{...reply,context:{...reply.context,[field]:value}}:reply});
  assert.equal((await f.request()).status,409);assert.equal(f.calls.length,0);assert.equal(run(f.page,'q0PinnedSource'),null);await f.retire();
});
test('private owner resource key with a control character is rejected before fetch',async()=>{
  const f=fixture({modifyReply:reply=>reply.type==='Q0_OWNER_RESPONSE'?{...reply,resourceKey:'synthetic\ninvalid'}:reply});
  assert.equal((await f.request()).status,409);assert.equal(f.calls.length,0);await f.retire();
});
test('native first abort detaches from shared acquisition and the next range receives its exact pin',async()=>{
  const gate=deferred(),started=deferred();let first=true;
  const f=fixture({fetch:async c=>{if(first&&!c.url.includes('alt=media')){first=false;started.resolve();await gate.promise;}}});
  const abort=new AbortController();const one=f.request('bytes=0-3',abort.signal);one.catch(()=>{});await started.promise;
  const two=f.request('bytes=4-7');await tick();abort.abort();gate.resolve();await assert.rejects(one,{name:'AbortError'});
  const r=await two;assert.equal(r.status,206);assert.deepEqual([...new Uint8Array(await r.arrayBuffer())],[65,65,65,65]);assert.equal(f.count('/download'),1);await f.retire();
});
test('source retirement joins cooperative pending metadata and forbids late page binding',async()=>{
  const started=deferred();let aborted=false;
  const f=fixture({fetch:c=>{if(!c.url.includes('alt=media')){started.resolve();return new Promise((_,reject)=>c.signal.addEventListener('abort',()=>{aborted=true;reject(new DOMException('retired','AbortError'));},{once:true}));}}});
  const request=f.request();request.catch(()=>{});await started.promise;const result=await f.retire();
  assert.equal(result.settled,true);assert.equal(aborted,true);await assert.rejects(request);assert.equal(run(f.page,'q0PinnedSource'),null);
  assert.equal(run(f.worker,'q1TransportOwners.size'),0);
});
test('noncooperative metadata cleanup remains sticky and blocks successor generation',async()=>{
  const started=deferred(),gate=deferred();const f=fixture({fastTimers:true,fetch:c=>{if(!c.url.includes('alt=media')){started.resolve();return gate.promise;}}});
  const request=f.request();request.catch(()=>{});await started.promise;assert.equal((await f.retire()).settled,false);
  run(f.page,'mediaSourceGeneration=13;beginQ0Playback(state.selected,7);');
  const response=await run(f.worker,'proxyDriveMedia')(new Request('https://app.test/__drive_media/fixture?mediaOwner=q0&sourceGeneration=13'),new URL('https://app.test/__drive_media/fixture?mediaOwner=q0&sourceGeneration=13'),'client');
  assert.equal(response.status,502);assert.equal(response.headers.get('X-Drive-Original-Q1-Cleanup'),'unconfirmed');
  gate.resolve(Response.json({}));await assert.rejects(request);await tick();assert.equal(run(f.page,'q0PinnedSource'),null);
});
test('pending operation polls entire opaque name exactly once; initial done does not GET',async()=>{
  const f=fixture({fastTimers:true,operation:o=>({...o,done:false,response:undefined})});
  const response=await f.request();assert.equal(response.status,206);await response.arrayBuffer();
  assert.equal(f.count('/operations/'),1);assert.ok(f.calls.find(c=>c.url.includes('/operations/')).url.endsWith('opaque%2Fname%2Bvalue%2Fpart'));await f.retire();
});
for(const mutation of ["state.authAccountKey='other'",'state.driveSessionGeneration=2','state.mediaSession=8','mediaSourceGeneration=13'])
test(`a changed page owner (${mutation}) rejects late pin admission`,async()=>{
  const gate=deferred(),started=deferred();let first=true;
  const f=fixture({fetch:async c=>{if(first&&!c.url.includes('alt=media')){first=false;started.resolve();await gate.promise;}}});
  const request=f.request();await started.promise;run(f.page,mutation);gate.resolve();
  assert.equal((await request).status,409);assert.equal(run(f.page,'q0PinnedSource'),null);
  assert.equal(f.calls.some(c=>c.url.includes('alt=media')),false);await f.retire();
});
test('retirement cancels a pending JSON reader and waits for its real cancellation barrier',async()=>{
  const started=deferred(),cancelled=deferred(),barrier=deferred();let cancelCount=0;
  const f=fixture({fetch:c=>{if(!c.url.includes('alt=media'))return new Response(new ReadableStream({
    pull(){started.resolve();},cancel(){cancelCount++;cancelled.resolve();return barrier.promise;}
  }));}});
  const request=f.request();request.catch(()=>{});await started.promise;
  let finished=false;const retirement=f.retire().then(r=>{finished=true;return r;});await cancelled.promise;await tick();
  assert.equal(finished,false);barrier.resolve();assert.equal((await retirement).settled,true);
  await assert.rejects(request);assert.equal(cancelCount,1);assert.equal(run(f.page,'q0PinnedSource'),null);
  assert.equal(run(f.worker,'q1TransportOwners.size'),0);
});
test('pinned body no-progress timeout cancels actual reader and status events omit private descriptor and URI',async()=>{
  let cancelled=0;const f=fixture({fastTimers:true,fetch:c=>{
    if(c.url.includes('alt=media'))return new Response(new ReadableStream({cancel(){cancelled++;}}),{
      status:206,headers:{'content-range':'bytes 0-3/16','content-length':'4','content-type':'video/mp4'}});
  }});
  const response=await f.request();await assert.rejects(response.arrayBuffer());assert.equal(cancelled,1);
  const diagnostics=JSON.stringify(f.messages.filter(m=>m.type.startsWith('MEDIA_')));
  for(const privateValue of [f.uri,'opaqueGrant','synthetic-1','a'.repeat(64)])assert.equal(diagnostics.includes(privateValue),false);
  assert.equal((await f.retire()).settled,true);
});
test('failed JSON-reader cancellation is sticky even after its read promise settles',async()=>{
  const started=deferred();let cancels=0;
  const f=fixture({fastTimers:true,fetch:c=>{if(!c.url.includes('alt=media'))return new Response(new ReadableStream({
    pull(){started.resolve();},cancel(){cancels++;return Promise.reject(Error('synthetic cancel rejection'));}
  }));}});
  const request=f.request();request.catch(()=>{});await started.promise;
  assert.equal((await f.retire()).settled,false);await assert.rejects(request);assert.equal(cancels,1);
  assert.equal(await run(f.worker,"waitForQ1CleanupFence('client')"),false);assert.equal(run(f.page,'q0PinnedSource'),null);
});
test('actual application source-pin classification terminates without native rebuild or original-buffer fallback',async()=>{
  const f=fixture();
  run(f.page,`globalThis.__clear=0;globalThis.__failure=null;
    clearDirectMediaSources=()=>{__clear++;};showMediaError=(message,options)=>{__failure=options;};
    retryOriginalStream=()=>{throw Error('unchecked native fallback');};
    offerOriginalBufferFallback=()=>{throw Error('unchecked original buffer fallback');};`);
  await run(f.page,"recoverFromMediaProxyError({category:'source-pin',status:409})");
  assert.equal(run(f.page,'state.mediaAttempt'),'failed');assert.equal(run(f.page,'__clear'),1);
  assert.equal(run(f.page,'__failure.showRetry'),false);assert.equal(run(f.page,'q0Playback'),null);
  assert.equal((await run(f.page,'q1Retirement')).settled,true);assert.equal(f.calls.length,0);
});
for(const status of [403,404,410])test(`revision HTTP ${status} becomes terminal source-pin and never resamples latest`,async()=>{
  const f=fixture({fetch:c=>c.url.includes('alt=media')?new Response('{}',{status}):undefined});
  const response=await f.request();assert.equal(response.status,status);
  assert.equal(f.count('/download'),1);assert.equal(f.messages.find(m=>m.type==='MEDIA_PROXY_ERROR').category,'source-pin');
  await f.retire();
});
test('full-original recovery uses retained revision URI and direct read authorization after latest changes',async()=>{
  const f=fixture();await(await f.request()).arrayBuffer();f.setLatest('B');const direct=[];
  f.page.fetch=async(target,options)=>{direct.push({target,options});return new Response(new Uint8Array(16).fill(65),{headers:{'content-length':'16'}});};
  const response=await run(f.page,"fetchOriginalFileResponse(state.selected,{requireRevisionPin:true})");
  assert.equal((await response.arrayBuffer()).byteLength,16);assert.equal(direct.length,1);assert.equal(direct[0].target,f.uri);
  assert.equal(direct[0].options.redirect,'error');assert.equal(direct[0].options.cache,'no-store');
  assert.equal(new Headers(direct[0].options.headers).get('authorization'),'Bearer synthetic-1');await f.retire();
});
test('full-original recovery without a pin fails explicitly while ordinary thumbnail reads retain their existing route',async()=>{
  const f=fixture();const direct=[];f.page.fetch=async target=>{direct.push(String(target));return new Response('thumbnail');};
  await assert.rejects(run(f.page,"fetchOriginalFileResponse(state.selected,{requireRevisionPin:true})"),{code:'PIN_UNAVAILABLE',status:422});
  assert.equal(direct.length,0);await run(f.page,'fetchOriginalFileResponse(state.selected)');
  assert.equal(new URL(direct[0]).pathname,'/drive/v3/files/fixture');assert.equal(new URL(direct[0]).searchParams.get('alt'),'media');await f.retire();
});
test('retained full-original resource-key header comes from the private descriptor rather than stale listing',async()=>{
  const f=fixture({metadata:m=>({...m,resourceKey:'pin-key'})});
  run(f.page,"state.selected.resourceKey='listing-key'");await(await f.request()).arrayBuffer();
  assert.equal(f.calls.find(c=>c.url.includes('alt=media')).headers.get('X-Goog-Drive-Resource-Keys'),'fixture/pin-key');
  let header;f.page.fetch=async(target,options)=>{header=new Headers(options.headers).get('X-Goog-Drive-Resource-Keys');return new Response(new Uint8Array(16));};
  await run(f.page,"fetchOriginalFileResponse(state.selected,{requireRevisionPin:true,headers:{'X-Goog-Drive-Resource-Keys':'fixture/listing-key'}})");
  assert.equal(header,'fixture/pin-key');await f.retire();
});
test('absent retained resource key removes stale listing key from SW ranges and direct full-original recovery',async()=>{
  const f=fixture();run(f.page,"state.selected.resourceKey='listing-key'");
  await(await f.request()).arrayBuffer();
  const range=f.calls.find(c=>c.url.includes('alt=media'));
  assert.equal(range.url,f.uri);assert.equal(range.headers.get('X-Goog-Drive-Resource-Keys'),null);
  assert.equal(run(f.page,'q0PinnedSource.descriptor.resourceKey'),null);
  let target,header;f.page.fetch=async(url,options)=>{target=url;header=new Headers(options.headers).get('X-Goog-Drive-Resource-Keys');return new Response(new Uint8Array(16));};
  await run(f.page,"fetchOriginalFileResponse(state.selected,{requireRevisionPin:true,headers:{'X-Goog-Drive-Resource-Keys':'fixture/listing-key'}})");
  assert.equal(target,f.uri);assert.equal(header,null);await f.retire();
});
function coldFixture() {
  const f=fixture(),events=new Set();let deadline;
  const video={dataset:{},classList:{add(){},remove(){}},load(){},pause(){},removeAttribute(name){delete this[name];}};
  f.page.__video=video;
  f.page.navigator.serviceWorker.controller=null;
  f.page.navigator.serviceWorker.addEventListener=(type,fn)=>{if(type==='controllerchange')events.add(fn);};
  f.page.navigator.serviceWorker.removeEventListener=(type,fn)=>{if(type==='controllerchange')events.delete(fn);};
  f.page.setTimeout=(fn,ms)=>{const timer=setTimeout(ms===12000?()=>{}:fn,ms===12000?120000:ms);timer.unref();if(ms===12000)deadline=fn;return timer;};
  f.page.window.setTimeout=f.page.setTimeout;
  run(f.page,`q0Playback=null;q1Playback=null;q1RetirementResult={settled:true};q1Retirement=Promise.resolve({settled:true});
    state.pendingPlay=false;globalThis.__errors=[];
    showMediaLoading=()=>{};showMediaError=(message,options)=>__errors.push({message,options});
    clearMediaSeekWatchdog=()=>{};clearMediaFrameWatchdog=()=>{};emitMediaDiagnosticStage=()=>{};
    updateQualityDisplay=()=>{};sendTokenToWorker=()=>{};cancelVideoFrameSampling=()=>{};cleanupOriginalTempStorage=()=>{};
    el.videoPlayer=__video;el.imageViewer={dataset:{},classList:{remove(){}},removeAttribute(){}};
    el.mediaLoading={hidden:true};el.mediaLoadingText={};`);
  return {...f,video,events,begin:()=>run(f.page,"startOriginalRangePlayback(state.selected,'video',7)"),
    expire:()=>deadline(),claim:()=>{f.page.navigator.serviceWorker.controller=f.controller;for(const fn of [...events])fn();}};
}
test('cold first controller claim waits for correlated capability, coalesces, then begins Q0',async()=>{
  const f=coldFixture();assert.equal(f.begin(),true);const waiting=run(f.page,'q0ControlWait');
  assert.equal(f.video.src,undefined);assert.equal(run(f.page,'state.mediaAttempt'),'range-preparing');
  f.begin();assert.equal(run(f.page,'q0ControlWait'),waiting);assert.equal(f.events.size,1);
  f.claim();assert.equal(f.video.src,undefined);await tick();assert.ok(f.video.src.includes('mediaOwner=q0'));assert.equal(run(f.page,'q0Playback.swController'),f.controller);
  assert.equal(f.events.size,0);assert.equal(run(f.page,'q0ControlWait'),null);
});
test('cold control deadline fails after bounded 12s without native assignment or compatibility fallback',()=>{
  const f=coldFixture();f.begin();f.expire();
  assert.equal(f.video.src,undefined);assert.equal(run(f.page,'state.mediaAttempt'),'failed');
  assert.equal(run(f.page,'__errors.length'),1);assert.equal(run(f.page,'__errors[0].options.showRetry'),false);
  assert.equal(f.events.size,0);f.claim();assert.equal(f.video.src,undefined);assert.equal(f.calls.length,0);
});
for(const mutation of ['clearDirectMediaSources()',"state.authAccountKey='other'",'state.driveSessionGeneration=2','state.mediaSession=8','mediaSourceGeneration=13'])
test(`cold control callback cannot resume after ${mutation}`,()=>{
  const f=coldFixture();f.begin();run(f.page,mutation);f.claim();
  assert.equal(f.video.src,undefined);assert.equal(run(f.page,'q0Playback'),null);assert.equal(f.events.size,0);assert.equal(f.calls.length,0);
});
