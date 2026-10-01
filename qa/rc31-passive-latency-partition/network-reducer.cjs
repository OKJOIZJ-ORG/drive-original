'use strict';
// CDP event arguments are inspected synchronously, then discarded. The map holds
// only an ephemeral requestId and finite reduced facts; no URL/header/body retained.
const ORIGIN='https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev';
const finite=v=>Number.isFinite(v)?v:null;
function createReducer(privateId,{limit=256,liveLimit=64}={}){
 if(typeof privateId!=='string'||!privateId)throw Error('PRIVATE_TARGET_REQUIRED');
 const live=new Map(),records=[],phases=[];let phase=null,ignored=0,overflow=0,redirects=0,closed=false,ordinal=0,mainFrameChanged=false;
 function classify(request){
  if(request?.method!=='GET')return null;
  try{const u=new URL(request.url),suffix=encodeURIComponent(privateId);
   if(u.origin===ORIGIN&&u.pathname==='/__drive_media/'+suffix)return 'OUTER_SW_MEDIA';
   if(u.origin==='https://www.googleapis.com'&&u.pathname==='/drive/v3/files/'+suffix)return u.searchParams.get('alt')==='media'?'PAGE_DRIVE_MEDIA':'DRIVE_METADATA';
  }catch{}return null;
 }
 const elapsed=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&b>=a?(b-a)*1000:null;
 function snapshot(r){const end=r.finishedTs??r.failedTs;return{ordinal:r.ordinal,phase:r.phase,class:r.class,
  startedEpochMs:r.wallMs,respondedEpochMs:r.wallMs!==null&&r.responseTs!==null?r.wallMs+(r.responseTs-r.startTs)*1000:null,
  completedEpochMs:r.wallMs!==null&&end!==null&&end!==undefined?r.wallMs+(end-r.startTs)*1000:null,
  phaseStartOffsetMs:r.wallMs!==null&&r.phaseArmedAt!==null?r.wallMs-r.phaseArmedAt:null,
  responseWaitMs:elapsed(r.startTs,r.responseTs),bodyDeliveryMs:elapsed(r.responseTs,end),totalMs:elapsed(r.startTs,end),
  status:r.status,rangeHeaderPresent:r.rangeHeaderPresent,fromServiceWorker:r.fromServiceWorker,
  dataEventCount:r.dataEventCount,dataBytes:r.dataBytes,encodedDataBytes:r.encodedDataBytes,encodedFinishedBytes:r.encodedFinishedBytes,
  completed:r.finishedTs!==null,failed:r.failedTs!==null,canceled:r.canceled,errorCode:r.errorCode,redirected:r.redirected};}
 const save=r=>{if(records.length<limit)records.push(snapshot(r));else overflow++;};
 function event(kind,e){if(closed)return;
  if(kind==='request'){
   const prior=live.get(e.requestId);if(prior){prior.redirected=true;save(prior);live.delete(e.requestId);redirects++;}
   const category=classify(e.request);if(!category){ignored++;return;}
   if(live.size>=liveLimit||records.length>=limit){overflow++;return;}
   const range=Object.keys(e.request.headers||{}).some(k=>k.toLowerCase()==='range');
   live.set(e.requestId,{ordinal:++ordinal,phase:phase?.label||'SETUP',phaseArmedAt:phase?.armedAt??null,class:category,
    startTs:finite(e.timestamp),wallMs:Number.isFinite(e.wallTime)?e.wallTime*1000:null,responseTs:null,finishedTs:null,failedTs:null,
    rangeHeaderPresent:range,status:null,fromServiceWorker:null,dataEventCount:0,dataBytes:0,encodedDataBytes:0,encodedFinishedBytes:null,
    canceled:false,errorCode:null,redirected:false});return;
  }
  const r=live.get(e.requestId);if(!r)return;
  if(kind==='response'){r.responseTs=finite(e.timestamp);r.status=finite(e.response?.status);r.fromServiceWorker=!!e.response?.fromServiceWorker;}
  else if(kind==='data'){r.dataEventCount++;r.dataBytes+=Number.isFinite(e.dataLength)&&e.dataLength>=0?e.dataLength:0;r.encodedDataBytes+=Number.isFinite(e.encodedDataLength)&&e.encodedDataLength>=0?e.encodedDataLength:0;}
  else if(kind==='finished'){r.finishedTs=finite(e.timestamp);r.encodedFinishedBytes=finite(e.encodedDataLength);save(r);live.delete(e.requestId);}
  else if(kind==='failed'){r.failedTs=finite(e.timestamp);r.canceled=!!e.canceled;r.errorCode=['net::ERR_ABORTED','net::ERR_FAILED','net::ERR_NETWORK_CHANGED','net::ERR_TIMED_OUT','net::ERR_CONNECTION_CLOSED','net::ERR_INTERNET_DISCONNECTED'].includes(e.errorText)?e.errorText:'OTHER';save(r);live.delete(e.requestId);}
 }
 function mark(label,armedAt){if(closed||!['startup','seek50','seek90'].includes(label)||!Number.isFinite(armedAt)||phases.length>=3)throw Error('NETWORK_PHASE');phase={label,armedAt};phases.push({...phase});}
 function read(){return{schema:'drive-original.rc31-passive-network/1',phases:phases.map(x=>({...x})),records:records.map(x=>({...x})),inflight:[...live.values()].map(snapshot),ignoredCount:ignored,overflowCount:overflow,redirectCount:redirects,
  mainFrameChanged,closed,recordLimit:limit,liveLimit,upstreamServiceWorkerVisibility:'UNKNOWN',responseBodyRead:false,requestWrapped:false,
  byteMeaning:'CDP dataLength / encodedDataLength; not a source integrity or upstream transfer assertion',rawIdentifiersExported:false};}
 function stop(){closed=true;const unfinished=[...live.values()].map(snapshot);live.clear();return{...read(),unfinished,privateCorrelationCleared:true};}
 return{event,mark,read,stop,frameChanged:()=>{mainFrameChanged=true;},classify};
}
async function attach(session,privateId){
 const reducer=createReducer(privateId),handlers=[];let frameId=null,stopped=false;
 const listen=(name,fn)=>{session.on(name,fn);handlers.push([name,fn]);};
 try{
  frameId=(await session.send('Page.getFrameTree')).frameTree.frame.id;
  for(const[name,kind]of Object.entries({'Network.requestWillBeSent':'request','Network.responseReceived':'response','Network.dataReceived':'data','Network.loadingFinished':'finished','Network.loadingFailed':'failed'}))listen(name,e=>reducer.event(kind,e));
  listen('Page.frameNavigated',e=>{if(e.frame.id===frameId&&!e.frame.parentId)reducer.frameChanged();});
  // Observation domains only: no caching, throttling, cookies, interception or body API.
  await session.send('Page.enable');await session.send('Network.enable',{});
 }catch{for(const[n,f]of handlers)session.off(n,f);reducer.stop();throw Error('PASSIVE_NETWORK_ATTACH_FAILED');}
 async function stop(){if(stopped)return reducer.read();stopped=true;for(const[n,f]of handlers)session.off(n,f);const r=reducer.stop();return{...r,listenersRemoved:handlers.length};}
 return{mark:reducer.mark,read:reducer.read,stop};
}
module.exports={createReducer,attach};
