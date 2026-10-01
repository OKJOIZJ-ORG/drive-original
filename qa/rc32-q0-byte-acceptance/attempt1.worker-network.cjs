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
 const live=new Map(),rows=[];let overflow=false,unqualified=false,armed=false;
 const read=()=>({requestCount:rows.length,live:live.size,overflow,unqualified,sourceWorker:true,
  actualBodyBytes:rows.reduce((n,r)=>n+r.bodyBytes,0),wireChunkBytes:rows.reduce((n,r)=>n+r.wireBytes,0),
  postCloseTrafficEnvelope:rows.reduce((n,r)=>n+Math.max(r.bodyBytes,r.wireBytes,r.finishedWireBytes||0),0),
  completeChunkObservation:rows.length>0&&live.size===0&&!overflow&&!unqualified&&rows.every(r=>r.terminal&&r.dataEvents>0&&r.identityEncoding&&!r.cache&&r.bodyBytes===r.wireBytes),
  all206RangeUpperBound:rows.length>0&&rows.every(r=>r.rangeValid&&r.status===206&&r.contentValid)?rows.reduce((n,r)=>n+r.rangeLength,0):null,
  rows:rows.map(r=>({...r})),rawIdentifiersExported:false,responseBodyRead:false});
 function event(method,e){
  if(method==='Network.requestWillBeSent'){
   let u;try{u=new URL(e.request.url);}catch{return;}
   if(u.origin!=='https://www.googleapis.com'||u.searchParams.get('alt')!=='media')return;
   if(u.pathname==='/drive/v3/files/'+id){unqualified=true;return;}
   if(!u.pathname.startsWith('/drive/v3/files/'+id+'/revisions/'))return;
   if(u.pathname!=='/drive/v3/files/'+id+'/revisions/'+revision){unqualified=true;return;}
   if(!armed||e.request.method!=='GET'||live.has(e.requestId)||e.redirectResponse){unqualified=true;return;}
   if(rows.length>=64){overflow=true;return;}
   const k=Object.keys(e.request.headers||{}).find(k=>k.toLowerCase()==='range'),m=/^bytes=(\d+)-(\d+)$/.exec(e.request.headers?.[k]||'');
   const start=m?Number(m[1]):null,end=m?Number(m[2]):null,valid=Number.isSafeInteger(start)&&Number.isSafeInteger(end)&&start>=0&&end>=start&&end<size;
   const r={ordinal:rows.length+1,status:null,rangeValid:valid,rangeLength:valid?end-start+1:null,start,end,contentValid:false,bodyBytes:0,wireBytes:0,finishedWireBytes:null,dataEvents:0,terminal:false,canceled:false,cache:false,identityEncoding:false};
   rows.push(r);live.set(e.requestId,r);return;
  }
  const r=live.get(e.requestId);if(!r)return;
  if(method==='Network.responseReceived'){
   r.status=e.response.status;r.cache=!!(e.response.fromDiskCache||e.response.fromServiceWorker||e.response.fromPrefetchCache);
   const h=e.response.headers||{},get=k=>h[Object.keys(h).find(x=>x.toLowerCase()===k)],m=/^bytes (\d+)-(\d+)\/(\d+)$/.exec(get('content-range')||'');
   r.contentValid=!!m&&Number(m[1])===r.start&&Number(m[2])===r.end&&Number(m[3])===size&&Number(get('content-length'))===r.rangeLength;
   r.identityEncoding=!get('content-encoding')||String(get('content-encoding')).toLowerCase()==='identity';
   if(r.cache||![200,206].includes(r.status))unqualified=true;
  }else if(method==='Network.dataReceived'){
   if(!Number.isSafeInteger(e.dataLength)||e.dataLength<0||!Number.isSafeInteger(e.encodedDataLength)||e.encodedDataLength<0){unqualified=true;return;}
   r.bodyBytes+=e.dataLength;r.wireBytes+=e.encodedDataLength;r.dataEvents++;
   if(!Number.isSafeInteger(r.bodyBytes)||!Number.isSafeInteger(r.wireBytes))unqualified=true;
  }else if(method==='Network.requestServedFromCache'){r.cache=true;unqualified=true;}
  else if(method==='Network.loadingFinished'||method==='Network.loadingFailed'){
   r.terminal=true;r.canceled=method==='Network.loadingFailed'&&e.canceled===true;
   if(method==='Network.loadingFinished'){if(!Number.isSafeInteger(e.encodedDataLength)||e.encodedDataLength<r.bodyBytes)unqualified=true;else r.finishedWireBytes=e.encodedDataLength;}
   if(method==='Network.loadingFailed'&&!r.canceled)unqualified=true;
   // finished encodedDataLength is not a media-body counter; deliberately not added.
   live.delete(e.requestId);
  }
 }
 return {event,arm(){if(armed)throw Error('Q0_ALREADY_ARMED');armed=true;},read,clear(){live.clear();return{privateCorrelationCleared:true};}};
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
