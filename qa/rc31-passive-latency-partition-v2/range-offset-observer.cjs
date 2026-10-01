'use strict';
// Optional future exact-target request-event observer. Import performs no actual call.
// No request wrappers, headers/URLs retained, response/body access or settings commands.
const ORIGIN='https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev';
const integer=v=>Number.isSafeInteger(v)&&v>=0?v:null;
const param=(u,k)=>{const v=u.searchParams.get(k);return typeof v==='string'&&/^\d+$/.test(v)?integer(Number(v)):null;};
function create(privateId){if(typeof privateId!=='string'||!privateId)throw Error('PRIVATE_TARGET_REQUIRED');let label='SETUP',closed=false,overflow=0;const records=[];
 function mark(v){if(!['startup','seek50','seek90'].includes(v))throw Error('PHASE_INVALID');label=v;}
 function request(event){if(closed)return;let u;try{u=new URL(event.request?.url);}catch{return;}
  if(event.request?.method!=='GET'||u.origin!==ORIGIN||u.pathname!=='/__drive_media/'+encodeURIComponent(privateId)||u.searchParams.get('mediaOwner')!=='q1')return;
  const h=event.request.headers||{},key=Object.keys(h).find(k=>k.toLowerCase()==='range'),match=typeof h[key]==='string'?/^bytes=(\d+)-(\d+)$/.exec(h[key]):null;
  const start=match?integer(Number(match[1])):null,end=match?integer(Number(match[2])):null;
  const valid=start!==null&&end!==null&&end>=start&&end-start+1<=1048576;
  if(records.length>=64){overflow++;return;}
  records.push({phase:label,startedEpochMs:Number.isFinite(event.wallTime)?event.wallTime*1000:null,rangeValid:valid,
   start:valid?start:null,end:valid?end:null,bytes:valid?end-start+1:null,
   sourceGeneration:param(u,'sourceGeneration'),session:param(u,'mediaSession'),
   packetAlignedStart:valid?start%188===0:null,attemptedReadOnly:true});
 }
 const read=()=>({schema:'drive-original.rc31-ts-range-offsets/1',records:records.map(r=>({...r})),overflow,closed,limit:64,
  numericOffsetsOnly:true,completedSourceReadsProven:false,rawIdentifiersExported:false,upstreamSWVisibility:'UNKNOWN'});
 return{mark,request,read,stop:()=>{closed=true;return read();}};
}
function attachAlreadyEnabledSession(session,privateId,{boundMs=120000}={}){
 if(!Number.isSafeInteger(boundMs)||boundMs<5000||boundMs>360000)throw Error('OBSERVER_BOUND');
 const r=create(privateId),handler=e=>r.request(e);session.on('Network.requestWillBeSent',handler);let stopped=false,timer;
 const stop=()=>{if(!stopped){session.off('Network.requestWillBeSent',handler);clearTimeout(timer);stopped=true;}return{...r.stop(),listenerRemoved:true};};
 timer=setTimeout(stop,boundMs);return{mark:r.mark,read:r.read,stop};
}
module.exports={create,attachAlreadyEnabledSession};
