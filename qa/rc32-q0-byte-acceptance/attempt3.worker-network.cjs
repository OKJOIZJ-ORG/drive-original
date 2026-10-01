'use strict';
// Source-worker only. No URL/header/body survives reduction; request keys remain private.
const ORIGIN='https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev';
const bounded=promise=>{let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Q0_CDP_DEADLINE')),5000);})]).finally(()=>clearTimeout(timer));};
function selectWorker(targets){
 const pages=targets.filter(t=>t.type==='page'&&safeOrigin(t.url)===ORIGIN);
 if(pages.length!==1)throw Error('Q0_PAGE_TARGET_COUNT');
 const workers=targets.filter(t=>t.type==='service_worker'&&t.url===ORIGIN+'/sw.js'&&t.browserContextId===pages[0].browserContextId);
 if(workers.length!==1)throw Error('Q0_WORKER_TARGET_COUNT');return workers[0].targetId;
}
function safeOrigin(u){try{return new URL(u).origin;}catch{return null;}}
function reducer(id,size,revision){
 if(!/^[A-Za-z0-9_-]{1,512}$/.test(id)||!/^[A-Za-z0-9_-]{1,512}$/.test(revision)||!Number.isSafeInteger(size)||size<=0)throw Error('Q0_INPUT');
 const live=new Map(),options=new Map(),seen=new Set(),rows=[],reasons={},methodCounts={get:0,options:0,other:0};let overflow=false,unqualified=false,armed=false;
 const reject=reason=>{unqualified=true;reasons[reason]=true;};
 const preflightValid=p=>p.requestValid&&p.responseCount===1&&p.status===204&&p.bodyBytes===0&&!p.invalidCounter&&p.terminalCount===1&&p.finished&&p.finishedWireBytes!==null;
 const read=()=>({requestCount:rows.length,live:live.size,overflow,unqualified,rejectionReasons:{...reasons},methodCounts:{...methodCounts},preflight:{requestCount:options.size,allQualified:[...options.values()].every(preflightValid),rows:[...options.values()].map(p=>({...p,qualified:preflightValid(p)}))},completionReasons:{liveRequests:live.size>0,unfinishedPreflight:[...options.values()].some(p=>!preflightValid(p)),missingResponse:rows.some(r=>!r.responseValid),missingData:rows.some(r=>r.dataEvents===0||r.bodyBytes<=0),encodedBelowBody:rows.some(r=>Math.max(r.wireBytes,r.finishedWireBytes||0)<r.bodyBytes),compressed:rows.some(r=>!r.identityEncoding)},sourceWorker:true,
  actualBodyBytes:rows.reduce((n,r)=>n+r.bodyBytes,0),wireChunkBytes:rows.reduce((n,r)=>n+r.wireBytes,0),
  postCloseTrafficEnvelope:rows.reduce((n,r)=>n+Math.max(r.bodyBytes,r.wireBytes,r.finishedWireBytes||0),0),
  completeChunkObservation:rows.length>0&&live.size===0&&!overflow&&!unqualified&&[...options.values()].every(preflightValid)&&rows.every(r=>r.terminal&&r.responseValid&&r.dataEvents>0&&r.bodyBytes>0&&r.identityEncoding&&!r.cache&&Math.max(r.wireBytes,r.finishedWireBytes||0)>=r.bodyBytes),
  all206RangeUpperBound:rows.length>0&&rows.every(r=>r.rangeValid&&r.status===206&&r.contentValid)?rows.reduce((n,r)=>n+r.rangeLength,0):null,
  rows:rows.map(r=>({...r})),rawIdentifiersExported:false,responseBodyRead:false});
 function event(method,e){
  if(method==='Network.requestWillBeSent'){
   let u;try{u=new URL(e.request.url);}catch{return;}
   if(u.origin!=='https://www.googleapis.com'||u.searchParams.get('alt')!=='media')return;
   if(u.pathname==='/drive/v3/files/'+id){reject('unpinnedSource');return;}
   if(!u.pathname.startsWith('/drive/v3/files/'+id+'/revisions/'))return;
   if(u.pathname!=='/drive/v3/files/'+id+'/revisions/'+revision){reject('wrongRevision');return;}
   const method=e.request.method;methodCounts[method==='GET'?'get':method==='OPTIONS'?'options':'other']++;
   const duplicate=seen.has(e.requestId);if(!armed)reject('beforeArm');if(duplicate)reject('duplicateRequest');if(e.redirectResponse)reject('redirect');
   if(method==='OPTIONS'){
    if(options.size>=64){reject('preflightOverflow');return;}const h=e.request.headers||{},k=Object.keys(h).find(k=>k.toLowerCase()==='access-control-request-method');
    const p={ordinal:options.size+1,typePreflight:e.type==='Preflight'||e.initiator?.type==='preflight',requestedMethodGet:h[k]==='GET',zeroPostData:!e.request.hasPostData&&!e.request.postData,responseCount:0,status:null,bodyBytes:0,wireBytes:0,terminalCount:0,finished:false,finishedWireBytes:null,invalidCounter:false};
    p.requestValid=armed&&!duplicate&&!e.redirectResponse&&p.typePreflight&&p.requestedMethodGet&&p.zeroPostData;if(!p.requestValid)reject('invalidPreflightRequest');if(!duplicate){seen.add(e.requestId);options.set(e.requestId,p);}return;
   }
   if(method!=='GET'){reject('nonGet');return;}if(!armed||duplicate||e.redirectResponse)return;
   if(rows.length>=64){overflow=true;reject('requestOverflow');return;}
   const k=Object.keys(e.request.headers||{}).find(k=>k.toLowerCase()==='range'),m=/^bytes=(\d+)-(\d+)$/.exec(e.request.headers?.[k]||'');
   const start=m?Number(m[1]):null,end=m?Number(m[2]):null,valid=Number.isSafeInteger(start)&&Number.isSafeInteger(end)&&start>=0&&end>=start&&end<size;
   const open=/^bytes=(\d+)-$/.exec(e.request.headers?.[k]||'');
   const r={ordinal:rows.length+1,status:null,rangeValid:valid,rangeLength:valid?end-start+1:null,start,end,openStart:open?Number(open[1]):null,contentValid:false,responseValid:false,bodyBytes:0,wireBytes:0,finishedWireBytes:null,dataEvents:0,terminal:false,canceled:false,cache:false,identityEncoding:false};
   seen.add(e.requestId);rows.push(r);live.set(e.requestId,r);return;
  }
  if(options.has(e.requestId)){if(!['Network.responseReceived','Network.dataReceived','Network.loadingFinished','Network.loadingFailed'].includes(method))return;const p=options.get(e.requestId);if(p.terminalCount>0){reject('preflightAfterTerminal');return;}if(method==='Network.responseReceived'){p.responseCount++;p.status=e.response.status;if(p.responseCount!==1||p.status!==204)reject('preflightResponse');}else if(method==='Network.dataReceived'){if([e.dataLength,e.encodedDataLength].every(x=>Number.isSafeInteger(x)&&x>=0)){p.bodyBytes+=e.dataLength;p.wireBytes+=e.encodedDataLength;if(!Number.isSafeInteger(p.bodyBytes)||!Number.isSafeInteger(p.wireBytes)){p.invalidCounter=true;reject('preflightCounter');}if(p.bodyBytes!==0)reject('preflightPayload');}else{p.invalidCounter=true;reject('preflightCounter');}}else if(method==='Network.loadingFinished'||method==='Network.loadingFailed'){p.terminalCount++;p.finished=method==='Network.loadingFinished';if(p.finished&&Number.isSafeInteger(e.encodedDataLength)&&e.encodedDataLength>=0)p.finishedWireBytes=e.encodedDataLength;else reject('preflightTerminal');}return;}
  const r=live.get(e.requestId);if(!r){if(method==='Network.responseReceived'){let u;try{u=new URL(e.response.url);}catch{return;}if(u.origin==='https://www.googleapis.com'&&u.searchParams.get('alt')==='media'&&u.pathname.startsWith('/drive/v3/files/'+id))reject('orphanSourceResponse');}return;}
  if(method==='Network.responseReceived'){
   r.status=e.response.status;r.cache=!!(e.response.fromDiskCache||e.response.fromServiceWorker||e.response.fromPrefetchCache);
   const h=e.response.headers||{},get=k=>h[Object.keys(h).find(x=>x.toLowerCase()===k)],m=/^bytes (\d+)-(\d+)\/(\d+)$/.exec(get('content-range')||'');
   r.contentValid=!!m&&Number(m[1])===r.start&&Number(m[2])===r.end&&Number(m[3])===size&&Number(get('content-length'))===r.rangeLength;
   const a=m?Number(m[1]):null,b=m?Number(m[2]):null,total=m?Number(m[3]):null,length=Number(get('content-length'));
   r.responseValid=r.status===206&&!!m&&[a,b,total,length].every(Number.isSafeInteger)&&a>=0&&b>=a&&b<size&&total===size&&length===b-a+1&&(r.contentValid||(Number.isSafeInteger(r.openStart)&&a===r.openStart));
   r.identityEncoding=!get('content-encoding')||String(get('content-encoding')).toLowerCase()==='identity';
   if(r.cache)reject('cachedResponse');if(![200,206].includes(r.status))reject('httpStatus');if(!r.responseValid)reject('responseTuple');if(!r.identityEncoding)reject('contentEncoding');
  }else if(method==='Network.dataReceived'){
   if(!Number.isSafeInteger(e.dataLength)||e.dataLength<0||!Number.isSafeInteger(e.encodedDataLength)||e.encodedDataLength<0){reject('invalidChunkCounter');return;}
   r.bodyBytes+=e.dataLength;r.wireBytes+=e.encodedDataLength;r.dataEvents++;
   if(!Number.isSafeInteger(r.bodyBytes)||!Number.isSafeInteger(r.wireBytes))reject('counterOverflow');
  }else if(method==='Network.requestServedFromCache'){r.cache=true;reject('cachedRequest');}
  else if(method==='Network.loadingFinished'||method==='Network.loadingFailed'){
   r.terminal=true;r.canceled=method==='Network.loadingFailed'&&e.canceled===true;
   if(method==='Network.loadingFinished'){if(!Number.isSafeInteger(e.encodedDataLength)||e.encodedDataLength<r.bodyBytes)reject('invalidFinishedCounter');else r.finishedWireBytes=e.encodedDataLength;}
   if(method==='Network.loadingFailed'&&!r.canceled)reject('nonCancellationFailure');
   // finished encodedDataLength is not a media-body counter; deliberately not added.
   live.delete(e.requestId);
  }
 }
 return {event,arm(){if(armed)throw Error('Q0_ALREADY_ARMED');armed=true;},read,clear(){live.clear();options.clear();seen.clear();return{privateCorrelationCleared:true};}};
}
async function attach(c,id,size,revision,{connect}={}){
 let port,browser,session,worker,target,disposed=false,next=0;const pending=new Map(),r=reducer(id,size,revision);
 const handler=e=>{if(e.sessionId!==worker)return;let m;try{m=JSON.parse(e.message);}catch{return;}
  if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error('Q0_WORKER_COMMAND_FAILED')):p.resolve(m.result);}
  else if(m.method)r.event(m.method,m.params||{});};
 const command=(method,params={})=>new Promise((resolve,reject)=>{const id=++next,timer=setTimeout(()=>{pending.delete(id);reject(Error('Q0_WORKER_COMMAND_DEADLINE'));},5000);pending.set(id,{resolve,reject,timer});session.send('Target.sendMessageToTarget',{sessionId:worker,message:JSON.stringify({id,method,params})}).catch(()=>{const p=pending.get(id);if(p){pending.delete(id);clearTimeout(timer);reject(Error('Q0_WORKER_SEND_FAILED'));}});});
 async function stop(){if(disposed)return{disposed:true};disposed=true;let ok=true;
  for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('Q0_WORKER_STOP'));}pending.clear();
  if(session){session.off('Target.receivedMessageFromTarget',handler);if(worker)try{await bounded(session.send('Target.detachFromTarget',{sessionId:worker}));}catch{ok=false;}try{await bounded(session.detach());}catch{ok=false;}}
  if(browser)try{await bounded(browser.close());}catch{ok=false;}
  if(port)try{c.adb(['forward','--remove','tcp:'+port]);}catch{ok=false;}
  return{disposed:true,ownedWorkerDetached:ok,ownedForwardRemoved:ok,...r.clear()};
 }
 try{
  port=Number(c.adb(['forward','tcp:0','localabstract:chrome_devtools_remote']));if(!Number.isSafeInteger(port)||port<1||port>65535)throw Error('Q0_FORWARD_INVALID');
  const chromium=connect||((url,options)=>require('../node_modules/playwright').chromium.connectOverCDP(url,options));
  browser=await chromium('http://127.0.0.1:'+port,{timeout:10000});session=await bounded(browser.newBrowserCDPSession());
  target=selectWorker((await bounded(session.send('Target.getTargets'))).targetInfos);
  worker=(await bounded(session.send('Target.attachToTarget',{targetId:target,flatten:false}))).sessionId;
  session.on('Target.receivedMessageFromTarget',handler);await command('Network.enable',{});
  return{arm:r.arm,read:r.read,stop,verify:async()=>{if(disposed||selectWorker((await bounded(session.send('Target.getTargets'))).targetInfos)!==target)throw Error('Q0_WORKER_CHANGED');return{sameWorkerTarget:true};}};
 }catch(e){await stop();throw Error(/^[A-Z0-9_]+$/.test(e.message)?e.message:'Q0_WORKER_BOUNDARY_UNAVAILABLE');}
}
module.exports={attach,reducer,selectWorker};
